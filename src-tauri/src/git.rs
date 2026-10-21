use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitInfo {
    pub version: String,
    pub path: String,
}

/// Extrae "2.53.0" de la salida de `git --version` ("git version 2.53.0").
fn parse_git_version(output: &str) -> Option<String> {
    output
        .split_whitespace()
        .skip_while(|word| *word != "version")
        .nth(1)
        .map(str::to_string)
}

/// Busca `name` recorriendo las carpetas de `path_var`, como haria `which`.
fn resolve_in_path(name: &str, path_var: &OsStr) -> Option<PathBuf> {
    let file_names: Vec<String> = if cfg!(windows) {
        vec![format!("{name}.exe"), name.to_string()]
    } else {
        vec![name.to_string()]
    };
    std::env::split_paths(path_var).find_map(|dir| {
        file_names
            .iter()
            .map(|file| dir.join(file))
            .find(|candidate| Path::is_file(candidate))
    })
}

/// Ejecutable de git: `git_path` si viene con valor, si no el primero que haya en el PATH.
pub(crate) fn resolve_git_exe(git_path: Option<String>) -> Result<PathBuf, String> {
    let custom = git_path
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    match custom {
        Some(path) => Ok(PathBuf::from(path)),
        None => {
            let path_var = std::env::var_os("PATH").unwrap_or_default();
            resolve_in_path("git", &path_var)
                .ok_or_else(|| "No se encontro git en el PATH del sistema.".to_string())
        }
    }
}

fn check_git_blocking(git_path: Option<String>) -> Result<GitInfo, String> {
    let exe = resolve_git_exe(git_path)?;

    let output = Command::new(&exe)
        .arg("--version")
        .output()
        .map_err(|err| format!("No se pudo ejecutar git en {}: {err}", exe.display()))?;

    if !output.status.success() {
        return Err(format!(
            "git en {} no respondio correctamente a --version.",
            exe.display()
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let version = parse_git_version(&stdout)
        .ok_or_else(|| format!("No se pudo leer la version de git: {}", stdout.trim()))?;

    Ok(GitInfo {
        version,
        path: exe.display().to_string(),
    })
}

#[tauri::command]
pub async fn check_git(git_path: Option<String>) -> Result<GitInfo, String> {
    tauri::async_runtime::spawn_blocking(move || check_git_blocking(git_path))
        .await
        .map_err(|err| format!("Error interno al comprobar git: {err}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_git_version_output() {
        assert_eq!(
            parse_git_version("git version 2.53.0\n").as_deref(),
            Some("2.53.0")
        );
        assert_eq!(
            parse_git_version("git version 2.39.2 (Apple Git-143)").as_deref(),
            Some("2.39.2")
        );
        assert_eq!(parse_git_version("no es git"), None);
    }

    #[test]
    fn resolves_git_in_path() {
        let path_var = std::env::var_os("PATH").unwrap_or_default();
        let found = resolve_in_path("git", &path_var);
        assert!(found.is_some(), "git no esta en el PATH de esta maquina");
    }
}
