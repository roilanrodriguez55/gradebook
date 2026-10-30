use std::fs;
use std::path::{Path, PathBuf};

use tauri::State;

pub(crate) const DB_FILE: &str = "entregas.db";
const LEGACY_IDENTIFIERS: [&str; 1] = ["com.roilanrodriguez55.gradebook"];

/// Carpeta de datos de la app (`~/.local/share/<id>` en Linux, `%APPDATA%\<id>` en Windows).
pub struct DataDir(pub PathBuf);

impl DataDir {
    /// En builds de desarrollo (`tauri dev`) usa una carpeta aparte (`<id>.dev`) para no tocar la base instalada.
    pub fn resolve(identifier: &str) -> Self {
        let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
        if cfg!(debug_assertions) {
            DataDir(base.join(format!("{identifier}.dev")))
        } else {
            DataDir(base.join(identifier))
        }
    }

    pub fn db_path(&self) -> PathBuf {
        self.0.join(DB_FILE)
    }

    /// Cadena de conexion del plugin SQL. El plugin la une a su carpeta base y una ruta absoluta la reemplaza.
    pub fn db_url(&self) -> String {
        format!("sqlite:{}", self.db_path().display())
    }
}

/// Solo en desarrollo: si la base de dev aun no existe, la crea como copia de la de produccion.
/// Para volver a copiarla, borra la carpeta `<id>.dev`. Nunca escribe en la carpeta de produccion ni aborta la app.
pub fn seed_dev_from_prod(data: &DataDir, identifier: &str) {
    if !cfg!(debug_assertions) || data.db_path().exists() {
        return;
    }
    let Some(base) = dirs::data_dir() else {
        return;
    };
    let prod = base.join(identifier);
    if !prod.join(DB_FILE).is_file() {
        return;
    }
    if let Err(err) = copy_db_files(&prod, &data.0) {
        eprintln!("No se pudo copiar la base de produccion a dev: {err}");
    }
}

/// Copia la base de una ubicacion anterior (carpeta de configuracion) si la nueva aun no existe.
/// No borra los originales. Nunca aborta la app.
pub fn migrate_legacy(data: &DataDir, identifier: &str) {
    if let Err(err) = copy_legacy_db(data, identifier) {
        eprintln!("No se pudo migrar la base anterior: {err}");
    }
}

fn copy_legacy_db(data: &DataDir, identifier: &str) -> Result<(), String> {
    if data.db_path().exists() {
        return Ok(());
    }
    let Some(config) = dirs::config_dir() else {
        return Ok(());
    };
    let legacy = std::iter::once(identifier)
        .chain(LEGACY_IDENTIFIERS)
        .map(|id| config.join(id))
        .find(|dir| dir.join(DB_FILE).is_file());
    let Some(legacy) = legacy else {
        return Ok(());
    };
    copy_db_files(&legacy, &data.0)
}

fn copy_db_files(from: &Path, to: &Path) -> Result<(), String> {
    fs::create_dir_all(to)
        .map_err(|err| format!("No se pudo crear {}: {err}", to.display()))?;
    for suffix in ["", "-wal", "-shm"] {
        let name = format!("{DB_FILE}{suffix}");
        let src = from.join(&name);
        if src.is_file() {
            fs::copy(&src, to.join(&name))
                .map_err(|err| format!("No se pudo copiar {}: {err}", src.display()))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn db_path(data: State<DataDir>) -> String {
    data.db_path().display().to_string()
}
