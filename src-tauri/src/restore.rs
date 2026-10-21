use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

pub(crate) const DB_FILE: &str = "entregas.db";
const RESTORE_FILE: &str = "entregas.db.restore";
const BACKUP_PREFIX: &str = "entregas.db.bak-";
const KEEP_BACKUPS: usize = 3;
const SQLITE_HEADER: &[u8] = b"SQLite format 3\0";

fn contains_bytes(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.windows(needle.len()).any(|window| window == needle)
}

/// Valida que los bytes parezcan un respaldo de Entregas: cabecera SQLite y la tabla `submissions`.
pub(crate) fn validate_backup(bytes: &[u8]) -> Result<(), String> {
    if bytes.is_empty() {
        return Err("El archivo esta vacio.".to_string());
    }
    if !bytes.starts_with(SQLITE_HEADER) {
        return Err("El archivo no es una base de datos SQLite.".to_string());
    }
    if !contains_bytes(bytes, b"submissions") {
        return Err("La base no parece un respaldo de Entregas (falta la tabla submissions).".to_string());
    }
    Ok(())
}

fn remove_if_exists(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(format!("No se pudo borrar {}: {err}", path.display())),
    }
}

/// Deja solo los `KEEP_BACKUPS` respaldos con marca de tiempo mas reciente.
fn prune_backups(dir: &Path) -> Result<(), String> {
    let entries = fs::read_dir(dir)
        .map_err(|err| format!("No se pudo leer la carpeta {}: {err}", dir.display()))?;
    let mut backups: Vec<(u128, PathBuf)> = entries
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let name = entry.file_name();
            let stamp = name.to_str()?.strip_prefix(BACKUP_PREFIX)?.parse::<u128>().ok()?;
            Some((stamp, entry.path()))
        })
        .collect();
    backups.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, path) in backups.into_iter().skip(KEEP_BACKUPS) {
        remove_if_exists(&path)?;
    }
    Ok(())
}

/// Si hay `entregas.db.restore`, lo pone como `entregas.db` y guarda el actual como respaldo.
/// Devuelve `true` si hizo el cambio.
pub(crate) fn swap_pending_restore(dir: &Path, now_millis: u128) -> Result<bool, String> {
    let restore = dir.join(RESTORE_FILE);
    if !restore.is_file() {
        return Ok(false);
    }

    // El WAL y el SHM pertenecen a la base actual; si quedan junto a la nueva, SQLite los aplicaria.
    for suffix in ["-wal", "-shm"] {
        remove_if_exists(&dir.join(format!("{DB_FILE}{suffix}")))?;
    }

    let db = dir.join(DB_FILE);
    if db.exists() {
        let backup = dir.join(format!("{BACKUP_PREFIX}{now_millis}"));
        fs::rename(&db, &backup).map_err(|err| {
            format!("No se pudo guardar la base actual en {}: {err}", backup.display())
        })?;
    }

    fs::rename(&restore, &db)
        .map_err(|err| format!("No se pudo colocar el respaldo como base: {err}"))?;

    prune_backups(dir)?;
    Ok(true)
}

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|err| format!("No se encontro la carpeta de configuracion: {err}"))
}

/// Llamado desde `setup`, antes de que el frontend abra la base. Nunca aborta la app.
pub fn apply_pending_restore(app: &AppHandle) {
    let result = config_dir(app).and_then(|dir| {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or_default();
        swap_pending_restore(&dir, now)
    });
    if let Err(err) = result {
        eprintln!("No se pudo aplicar el respaldo pendiente: {err}");
    }
}

fn stage_restore_blocking(dir: &Path, src: &Path) -> Result<(), String> {
    let bytes = fs::read(src)
        .map_err(|err| format!("No se pudo leer {}: {err}", src.display()))?;
    validate_backup(&bytes)?;
    fs::create_dir_all(dir)
        .map_err(|err| format!("No se pudo crear la carpeta {}: {err}", dir.display()))?;
    fs::write(dir.join(RESTORE_FILE), &bytes)
        .map_err(|err| format!("No se pudo preparar el respaldo: {err}"))
}

#[tauri::command]
pub async fn stage_restore(app: AppHandle, src: String) -> Result<(), String> {
    let dir = config_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || stage_restore_blocking(&dir, Path::new(&src)))
        .await
        .map_err(|err| format!("Error interno al preparar el respaldo: {err}"))?
}

#[tauri::command]
pub fn restart_app(app: AppHandle) {
    app.restart();
}

fn has_db_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("db"))
}

/// Evita que el borrado alcance la base en uso. Si una de las rutas no existe, no es la misma base.
fn is_live_db(path: &Path, dir: &Path) -> bool {
    match (fs::canonicalize(path), fs::canonicalize(dir.join(DB_FILE))) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

#[tauri::command]
pub fn remove_file_if_exists(app: AppHandle, path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !has_db_extension(target) {
        return Err("Solo se pueden borrar archivos .db".to_string());
    }
    if is_live_db(target, &config_dir(&app)?) {
        return Err("No se puede borrar la base en uso".to_string());
    }
    if target.is_dir() {
        return Err(format!("{path} es una carpeta"));
    }
    remove_if_exists(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Directorio temporal que se borra al salir, incluso si el test falla.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new(name: &str) -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or_default();
            let path = std::env::temp_dir().join(format!(
                "entregas-restore-test-{name}-{}-{nanos}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("crear directorio temporal");
            TempDir(path)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn backup_bytes(marker: &str) -> Vec<u8> {
        let mut bytes = SQLITE_HEADER.to_vec();
        bytes.extend_from_slice(b"CREATE TABLE submissions (id INTEGER);");
        bytes.extend_from_slice(marker.as_bytes());
        bytes
    }

    #[test]
    fn validates_backup_header() {
        assert!(validate_backup(&backup_bytes("nuevo")).is_ok());
        assert!(validate_backup(b"").is_err());
        assert!(validate_backup(b"texto plano con submissions").is_err());
        let mut sin_tabla = SQLITE_HEADER.to_vec();
        sin_tabla.extend_from_slice(b"CREATE TABLE otra (id INTEGER);");
        assert!(validate_backup(&sin_tabla).is_err());
    }

    #[test]
    fn swap_replaces_db_keeps_backup_and_removes_wal_shm() {
        let tmp = TempDir::new("swap");
        let dir = &tmp.0;
        fs::write(dir.join(DB_FILE), b"datos actuales").unwrap();
        fs::write(dir.join("entregas.db-wal"), b"wal viejo").unwrap();
        fs::write(dir.join("entregas.db-shm"), b"shm viejo").unwrap();
        fs::write(dir.join(RESTORE_FILE), b"datos restaurados").unwrap();

        assert_eq!(swap_pending_restore(dir, 1_000), Ok(true));

        assert_eq!(fs::read(dir.join(DB_FILE)).unwrap(), b"datos restaurados");
        assert_eq!(
            fs::read(dir.join(format!("{BACKUP_PREFIX}1000"))).unwrap(),
            b"datos actuales"
        );
        assert!(!dir.join("entregas.db-wal").exists());
        assert!(!dir.join("entregas.db-shm").exists());
        assert!(!dir.join(RESTORE_FILE).exists());
    }

    #[test]
    fn swap_without_restore_file_does_nothing() {
        let tmp = TempDir::new("noop");
        fs::write(tmp.0.join(DB_FILE), b"actual").unwrap();
        assert_eq!(swap_pending_restore(&tmp.0, 1_000), Ok(false));
        assert_eq!(fs::read(tmp.0.join(DB_FILE)).unwrap(), b"actual");
    }

    #[test]
    fn swap_keeps_only_three_newest_backups() {
        let tmp = TempDir::new("prune");
        let dir = &tmp.0;
        for stamp in [1_000u128, 2_000, 3_000, 4_000] {
            fs::write(dir.join(format!("{BACKUP_PREFIX}{stamp}")), b"viejo").unwrap();
        }
        fs::write(dir.join(DB_FILE), b"actual").unwrap();
        fs::write(dir.join(RESTORE_FILE), b"nuevo").unwrap();

        assert_eq!(swap_pending_restore(dir, 5_000), Ok(true));

        let mut backups: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|name| name.starts_with(BACKUP_PREFIX))
            .collect();
        backups.sort();
        assert_eq!(
            backups,
            vec![
                format!("{BACKUP_PREFIX}3000"),
                format!("{BACKUP_PREFIX}4000"),
                format!("{BACKUP_PREFIX}5000"),
            ]
        );
    }

    #[test]
    fn db_extension_is_required() {
        assert!(has_db_extension(Path::new("/x/respaldo.db")));
        assert!(has_db_extension(Path::new("/x/RESPALDO.DB")));
        assert!(!has_db_extension(Path::new("/x/respaldo.txt")));
        assert!(!has_db_extension(Path::new("/x/sinextension")));
    }
}
