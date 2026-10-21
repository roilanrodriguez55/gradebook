use tauri_plugin_sql::{Migration, MigrationKind};

mod clone;
mod git;
mod restore;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            restore::apply_pending_restore(app.handle());
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:entregas.db",
                    vec![Migration {
                        version: 1,
                        description: "init",
                        sql: include_str!("../migrations/001_init.sql"),
                        kind: MigrationKind::Up,
                    },
                    Migration {
                        version: 2,
                        description: "grade_scale",
                        sql: include_str!("../migrations/002_grade_scale.sql"),
                        kind: MigrationKind::Up,
                    },
                    Migration {
                        version: 3,
                        description: "subject_download_folder",
                        sql: include_str!("../migrations/003_subject_download_folder.sql"),
                        kind: MigrationKind::Up,
                    }],
                )
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            git::check_git,
            clone::sync_repo,
            restore::stage_restore,
            restore::restart_app,
            restore::remove_file_if_exists
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
