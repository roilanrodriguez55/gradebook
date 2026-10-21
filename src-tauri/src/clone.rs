use std::fs;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use crate::git::resolve_git_exe;

const GITHUB_PREFIX: &str = "https://github.com/";
const GIT_TIMEOUT: Duration = Duration::from_secs(300);
const POLL_INTERVAL: Duration = Duration::from_millis(100);
const DIVERGED_MESSAGE: &str =
    "El repositorio cambio y no se puede actualizar; borra la carpeta del estudiante y vuelve a descargar";

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SyncAction {
    Clone,
    Pull,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub action: SyncAction,
    pub sha: String,
    pub commit_date: String,
}

/// Traduce el stderr de git a un mensaje legible. Si no lo reconoce, devuelve el stderr recortado.
fn humanize_git_error(stderr: &str) -> String {
    let text = stderr.trim();
    if text.contains("Repository not found") || text.contains("terminal prompts disabled") {
        "Repositorio no encontrado o privado".to_string()
    } else if text.contains("Could not resolve host") {
        "Sin conexion".to_string()
    } else if text.is_empty() {
        "git termino con error sin mensaje".to_string()
    } else {
        text.to_string()
    }
}

/// Compara dos URLs sin importar el .git final, la barra final ni la mayuscula del host.
fn normalize_url(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/');
    let trimmed = trimmed.strip_suffix(".git").unwrap_or(trimmed).trim_end_matches('/');
    match trimmed.find("://") {
        Some(scheme_end) => {
            let rest = &trimmed[scheme_end + 3..];
            let host_end = rest.find('/').unwrap_or(rest.len());
            let (host, path) = rest.split_at(host_end);
            format!("{}://{}{}", &trimmed[..scheme_end], host.to_lowercase(), path)
        }
        None => trimmed.to_string(),
    }
}

/// Indica si el error de git viene de historiales que no se pueden unir con fast-forward.
fn is_diverged_error(err: &str) -> bool {
    err.contains("Not possible to fast-forward") || err.contains("refusing to merge unrelated histories")
}

fn read_all<R: Read>(reader: Option<R>) -> String {
    let mut buf = Vec::new();
    if let Some(mut reader) = reader {
        let _ = reader.read_to_end(&mut buf);
    }
    String::from_utf8_lossy(&buf).into_owned()
}

/// Ejecuta git sin prompts y con timeout. Devuelve stdout o un error ya legible.
fn run_git(git: &Path, args: &[&str]) -> Result<String, String> {
    let mut child = Command::new(git)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        // Mensajes de git en ingles para reconocer los errores por texto.
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("No se pudo ejecutar git en {}: {err}", git.display()))?;

    // Leer en hilos evita que un pipe lleno bloquee al proceso mientras esperamos.
    let stdout_reader = thread::spawn({
        let stdout = child.stdout.take();
        move || read_all(stdout)
    });
    let stderr_reader = thread::spawn({
        let stderr = child.stderr.take();
        move || read_all(stderr)
    });

    let deadline = Instant::now() + GIT_TIMEOUT;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("Tiempo agotado: git tardo mas de 300 segundos".to_string());
                }
                thread::sleep(POLL_INTERVAL);
            }
            Err(err) => return Err(format!("Error esperando a git: {err}")),
        }
    };

    let stdout = stdout_reader.join().unwrap_or_default();
    let stderr = stderr_reader.join().unwrap_or_default();
    if status.success() {
        Ok(stdout)
    } else {
        Err(humanize_git_error(&stderr))
    }
}

fn is_empty_dir(path: &Path) -> Result<bool, String> {
    let mut entries = fs::read_dir(path)
        .map_err(|err| format!("No se pudo leer la carpeta {}: {err}", path.display()))?;
    Ok(entries.next().is_none())
}

/// Logica de sincronizacion sin validar la URL. El comando publico valida que sea de GitHub.
fn sync_internal(git: &Path, url: &str, dest: &Path) -> Result<SyncResult, String> {
    let dest_str = dest
        .to_str()
        .ok_or_else(|| "La ruta de destino no es valida".to_string())?;

    let action = if dest.join(".git").exists() {
        let current = run_git(git, &["-C", dest_str, "remote", "get-url", "origin"])?;
        if normalize_url(&current) != normalize_url(url) {
            run_git(git, &["-C", dest_str, "remote", "set-url", "origin", url])?;
        }
        run_git(git, &["-C", dest_str, "fetch", "--all", "--prune"])?;
        match run_git(git, &["-C", dest_str, "pull", "--ff-only"]) {
            Ok(_) => {}
            Err(err) if is_diverged_error(&err) => return Err(DIVERGED_MESSAGE.to_string()),
            Err(err) => return Err(err),
        }
        SyncAction::Pull
    } else {
        let is_free = if dest.exists() {
            dest.is_dir() && is_empty_dir(dest)?
        } else {
            true
        };
        if !is_free {
            return Err("La carpeta ya existe y no es un repositorio".to_string());
        }
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)
                .map_err(|err| format!("No se pudo crear la carpeta {}: {err}", parent.display()))?;
        }
        run_git(git, &["clone", url, dest_str])?;
        SyncAction::Clone
    };

    let log = run_git(git, &["-C", dest_str, "log", "-1", "--format=%H%n%cI"])?;
    let mut lines = log.lines();
    let sha = lines.next().unwrap_or_default().trim().to_string();
    let commit_date = lines.next().unwrap_or_default().trim().to_string();
    if sha.is_empty() || commit_date.is_empty() {
        return Err(format!("No se pudo leer el ultimo commit: {}", log.trim()));
    }

    Ok(SyncResult {
        action,
        sha,
        commit_date,
    })
}

#[tauri::command]
pub async fn sync_repo(
    url: String,
    dest: String,
    git_path: Option<String>,
) -> Result<SyncResult, String> {
    if !url.starts_with(GITHUB_PREFIX) {
        return Err("La URL debe ser un repositorio de GitHub (https://github.com/...)".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let git = resolve_git_exe(git_path)?;
        sync_internal(&git, &url, Path::new(&dest))
    })
    .await
    .map_err(|err| format!("Error interno al sincronizar: {err}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    /// Directorio temporal que se borra al salir, incluso si el test falla.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or_default();
            let path = std::env::temp_dir().join(format!(
                "entregas-clone-test-{}-{nanos}",
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

    fn git_ok(git: &Path, cwd: &Path, args: &[&str]) {
        let status = Command::new(git)
            .arg("-C")
            .arg(cwd)
            .args(["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"])
            .args(args)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .expect("ejecutar git");
        assert!(status.success(), "git {args:?} fallo");
    }

    /// Crea un repo origen con un commit. Devuelve su ruta como string para usarla como URL.
    fn make_origin(root: &Path) -> (PathBuf, String) {
        let origin = root.join("origin");
        fs::create_dir_all(&origin).unwrap();
        let git = resolve_git_exe(None).expect("git en PATH");
        git_ok(&git, &origin, &["init", "-q", "-b", "main"]);
        fs::write(origin.join("README.md"), "hola\n").unwrap();
        git_ok(&git, &origin, &["add", "."]);
        git_ok(&git, &origin, &["commit", "-q", "-m", "primer commit"]);
        let url = origin.to_str().unwrap().to_string();
        (origin, url)
    }

    fn is_sha(s: &str) -> bool {
        s.len() == 40 && s.chars().all(|c| c.is_ascii_hexdigit())
    }

    #[test]
    fn clone_then_pull_then_pull_new_commit() {
        let tmp = TempDir::new();
        let git = resolve_git_exe(None).expect("git en PATH");
        let (origin, url) = make_origin(&tmp.0);
        let dest = tmp.0.join("alumnos").join("Perez_Ana");

        let first = sync_internal(&git, &url, &dest).expect("clone");
        assert_eq!(first.action, SyncAction::Clone);
        assert!(is_sha(&first.sha), "sha invalido: {}", first.sha);
        assert!(dest.join("README.md").exists());

        let second = sync_internal(&git, &url, &dest).expect("pull sin cambios");
        assert_eq!(second.action, SyncAction::Pull);
        assert_eq!(second.sha, first.sha);

        fs::write(origin.join("cambio.txt"), "nuevo\n").unwrap();
        git_ok(&git, &origin, &["add", "."]);
        git_ok(&git, &origin, &["commit", "-q", "-m", "segundo commit"]);
        let expected = Command::new(&git)
            .arg("-C")
            .arg(&origin)
            .args(["rev-parse", "HEAD"])
            .output()
            .expect("rev-parse");
        let expected = String::from_utf8_lossy(&expected.stdout).trim().to_string();

        let third = sync_internal(&git, &url, &dest).expect("pull con commit nuevo");
        assert_eq!(third.action, SyncAction::Pull);
        assert_eq!(third.sha, expected);
        assert_ne!(third.sha, first.sha);
        assert!(dest.join("cambio.txt").exists());
    }

    #[test]
    fn non_repo_folder_with_files_is_an_error() {
        let tmp = TempDir::new();
        let git = resolve_git_exe(None).expect("git en PATH");
        let (_origin, url) = make_origin(&tmp.0);
        let dest = tmp.0.join("ocupada");
        fs::create_dir_all(&dest).unwrap();
        fs::write(dest.join("notas.txt"), "x").unwrap();

        let err = sync_internal(&git, &url, &dest).unwrap_err();
        assert_eq!(err, "La carpeta ya existe y no es un repositorio");
    }

    #[test]
    fn missing_repository_fails_without_hanging() {
        let tmp = TempDir::new();
        let git = resolve_git_exe(None).expect("git en PATH");
        let url = tmp.0.join("no-existe").to_str().unwrap().to_string();
        let dest = tmp.0.join("destino");

        let err = sync_internal(&git, &url, &dest).unwrap_err();
        assert!(!err.is_empty());
    }

    /// Inicializa un repo en `dir` con un commit que contiene `file`.
    fn init_repo(git: &Path, dir: &Path, file: &str) {
        fs::create_dir_all(dir).unwrap();
        git_ok(git, dir, &["init", "-q", "-b", "main"]);
        fs::write(dir.join(file), "otro\n").unwrap();
        git_ok(git, dir, &["add", "."]);
        git_ok(git, dir, &["commit", "-q", "-m", "primer commit"]);
    }

    fn head_sha(git: &Path, dir: &Path) -> String {
        let out = Command::new(git)
            .arg("-C")
            .arg(dir)
            .args(["rev-parse", "HEAD"])
            .output()
            .expect("rev-parse");
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    }

    #[test]
    fn changed_origin_url_pulls_from_new_origin() {
        let tmp = TempDir::new();
        let git = resolve_git_exe(None).expect("git en PATH");
        let (_origin, url) = make_origin(&tmp.0);
        let dest = tmp.0.join("alumnos").join("Perez_Ana");
        sync_internal(&git, &url, &dest).expect("clone");

        // Otro repo con la historia del primero mas un commit nuevo: el pull debe ser fast-forward.
        let fork = tmp.0.join("fork");
        git_ok(&git, &tmp.0, &["clone", "-q", url.as_str(), fork.to_str().unwrap()]);
        fs::write(fork.join("nuevo.txt"), "fork\n").unwrap();
        git_ok(&git, &fork, &["add", "."]);
        git_ok(&git, &fork, &["commit", "-q", "-m", "commit del fork"]);
        let fork_url = fork.to_str().unwrap().to_string();
        let expected = head_sha(&git, &fork);

        let synced = sync_internal(&git, &fork_url, &dest).expect("pull desde el nuevo origin");
        assert_eq!(synced.action, SyncAction::Pull);
        assert_eq!(synced.sha, expected);
        assert!(dest.join("nuevo.txt").exists());
    }

    #[test]
    fn unrelated_origin_reports_readable_error() {
        let tmp = TempDir::new();
        let git = resolve_git_exe(None).expect("git en PATH");
        let (_origin, url) = make_origin(&tmp.0);
        let dest = tmp.0.join("alumnos").join("Perez_Ana");
        sync_internal(&git, &url, &dest).expect("clone");

        let otro = tmp.0.join("otro");
        init_repo(&git, &otro, "distinto.txt");
        let otro_url = otro.to_str().unwrap().to_string();

        let err = sync_internal(&git, &otro_url, &dest).unwrap_err();
        assert_eq!(err, DIVERGED_MESSAGE);
    }

    #[test]
    fn normalize_url_ignores_git_suffix_slash_and_host_case() {
        assert_eq!(
            normalize_url("https://GitHub.com/Ana/Repo.git/"),
            "https://github.com/Ana/Repo"
        );
        assert_eq!(
            normalize_url(" https://github.com/Ana/Repo "),
            "https://github.com/Ana/Repo"
        );
        assert_ne!(
            normalize_url("https://github.com/Ana/Repo"),
            normalize_url("https://github.com/Ana/Otro")
        );
    }

    #[test]
    fn humanizes_known_git_errors() {
        assert_eq!(
            humanize_git_error("remote: Repository not found.\nfatal: repository 'x' not found"),
            "Repositorio no encontrado o privado"
        );
        assert_eq!(
            humanize_git_error("fatal: unable to access: Could not resolve host: github.com"),
            "Sin conexion"
        );
        assert_eq!(humanize_git_error("  algo raro  "), "algo raro");
    }
}
