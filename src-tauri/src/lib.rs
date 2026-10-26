use tauri_plugin_sql::{Migration, MigrationKind};

mod clone;
mod data;
mod git;
mod restore;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    let identifier = context.config().identifier.clone();
    let data_dir = data::DataDir::resolve(&identifier);
    let db_url = data_dir.db_url();
    if let Err(err) = std::fs::create_dir_all(&data_dir.0) {
        eprintln!("No se pudo crear {}: {err}", data_dir.0.display());
    }
    data::migrate_legacy(&data_dir, &identifier);

    tauri::Builder::default()
        .manage(data_dir)
        .setup(|app| {
            restore::apply_pending_restore(app.handle());
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    &db_url,
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
                    },
                    Migration {
                        version: 4,
                        description: "courses_enrollments",
                        sql: include_str!("../migrations/004_courses_enrollments.sql"),
                        kind: MigrationKind::Up,
                    }],
                )
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            data::db_path,
            git::check_git,
            clone::sync_repo,
            restore::stage_restore,
            restore::restart_app,
            restore::remove_file_if_exists
        ])
        .run(context)
        .expect("error while running tauri application");
}
