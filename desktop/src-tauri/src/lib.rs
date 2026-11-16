//! Kontakte-Akte desktop shell (Tauri 2).
//!
//! Lifecycle / shutdown policy:
//! * Launch: ensure Docker + backend container (see `docker.rs`), then the UI unlocks.
//! * Closing the window (red button) only hides it – the app keeps running in the
//!   Dock so reminder notifications keep working. Clicking the Dock icon reopens it.
//! * Quitting (⌘Q / menu): the database is locked and the backend container is
//!   stopped with `docker compose stop` (never `down -v`; data stays on disk).

mod bridge;
mod docker;
mod notifications;
mod paths;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;

use bridge::{ApiError, Bridge};
use docker::StartupError;
use notifications::{NotificationPlan, Scheduler};
use paths::{log_line, AppPaths};

struct AppState {
    paths: AppPaths,
    version: String,
    bridge: Bridge,
    scheduler: Scheduler,
    /// Developer/test mode: use a backend that is already running on 127.0.0.1:47811
    /// instead of Docker (KA_EXTERNAL_BACKEND=1). The backend must still identify itself.
    external_backend: bool,
    backend_started: AtomicBool,
    shutdown_done: AtomicBool,
    startup_lock: Mutex<()>,
}

#[derive(Serialize, Clone)]
struct Progress {
    stage: String,
    message: String,
}

#[derive(Serialize)]
struct AppInfo {
    version: String,
    data_dir: String,
    database_file: String,
    backups_dir: String,
    backend_url: String,
    shutdown_policy: String,
}

fn app_info_for(state: &AppState) -> AppInfo {
    AppInfo {
        version: state.version.clone(),
        data_dir: state.paths.root.to_string_lossy().into_owned(),
        database_file: state.paths.database_file().to_string_lossy().into_owned(),
        backups_dir: state.paths.backups().to_string_lossy().into_owned(),
        backend_url: docker::backend_url(),
        shutdown_policy: "Beim Beenden (⌘Q) wird die Datenbank gesperrt und der Backend-Container gestoppt. \
            Das Schließen des Fensters lässt Kontakte-Akte im Dock weiterlaufen (für Erinnerungen)."
            .into(),
    }
}

fn internal(message: impl Into<String>) -> StartupError {
    StartupError { code: "internal", message: "Kontakte-Akte konnte nicht vorbereitet werden.".into(), detail: Some(message.into()) }
}

#[tauri::command]
async fn start_backend(app: AppHandle, state: State<'_, Arc<AppState>>) -> Result<AppInfo, StartupError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = state.startup_lock.lock().unwrap();
        state.paths.ensure().map_err(internal)?;
        state.bridge.rotate_token(&state.paths).map_err(internal)?;
        let resource_dir = app.path().resource_dir().map_err(|e| internal(e.to_string()))?;
        let bundle_runtime: PathBuf = resource_dir.join("resources").join("runtime");
        log_line(&state.paths, "startup: begin");
        let emitter = app.clone();
        let paths = state.paths.clone();
        let result = docker::start_backend(
            &state.paths,
            &bundle_runtime,
            &state.version,
            state.external_backend,
            &move |stage, message| {
                log_line(&paths, &format!("startup: {stage}"));
                let _ = emitter.emit("startup-progress", Progress { stage: stage.into(), message: message.into() });
            },
        );
        match &result {
            Ok(()) => {
                state.backend_started.store(true, Ordering::SeqCst);
            }
            Err(e) => log_line(&state.paths, &format!("startup: failed ({})", e.code)),
        }
        result.map(|_| app_info_for(&state))
    })
    .await
    .map_err(|e| internal(e.to_string()))?
}

#[tauri::command]
fn app_info(state: State<'_, Arc<AppState>>) -> AppInfo {
    app_info_for(state.inner())
}

#[tauri::command]
async fn api_request(
    state: State<'_, Arc<AppState>>,
    method: String,
    path: String,
    body: Option<Value>,
) -> Result<Value, ApiError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = state.bridge.request(&method, &path, body);
        if !state.bridge.has_session() {
            state.scheduler.redact();
        }
        result
    })
    .await
    .map_err(|_| ApiError { status: 0, code: "bridge".into(), message: "Interner Fehler.".into() })?
}

fn valid_backup_name(name: &str) -> bool {
    name.len() <= 160
        && name.ends_with(".kabackup")
        && !name.starts_with('.')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

/// Opens a native save dialog and copies a backup from the managed backups folder.
/// The webview can only name a file inside that folder; the destination is chosen by the user.
#[tauri::command]
async fn export_backup(app: AppHandle, state: State<'_, Arc<AppState>>, file_name: String) -> Result<Option<String>, String> {
    if !valid_backup_name(&file_name) {
        return Err("Ungültiger Dateiname.".into());
    }
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let source = state.paths.backups().join(&file_name);
        if !source.is_file() {
            return Err("Sicherung nicht gefunden.".to_string());
        }
        let Some(dest) = app
            .dialog()
            .file()
            .set_title("Sicherung speichern")
            .set_file_name(&file_name)
            .add_filter("Kontakte-Akte-Sicherung", &["kabackup"])
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let dest = dest.into_path().map_err(|e| e.to_string())?;
        std::fs::copy(&source, &dest).map_err(|e| format!("Kopieren fehlgeschlagen: {e}"))?;
        let _ = std::fs::set_permissions(&dest, std::os::unix::fs::PermissionsExt::from_mode(0o600));
        log_line(&state.paths, "backup: exported");
        Ok(Some(dest.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Opens a native file picker and stages the chosen backup for verification/restore.
#[tauri::command]
async fn import_backup(app: AppHandle, state: State<'_, Arc<AppState>>) -> Result<Option<String>, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let Some(picked) = app
            .dialog()
            .file()
            .set_title("Sicherung auswählen")
            .add_filter("Kontakte-Akte-Sicherung", &["kabackup"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let source = picked.into_path().map_err(|e| e.to_string())?;
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        let name = format!("import-{stamp}.kabackup");
        std::fs::create_dir_all(state.paths.import()).map_err(|e| e.to_string())?;
        let dest = state.paths.import().join(&name);
        std::fs::copy(&source, &dest).map_err(|e| format!("Kopieren fehlgeschlagen: {e}"))?;
        let _ = std::fs::set_permissions(&dest, std::os::unix::fs::PermissionsExt::from_mode(0o600));
        log_line(&state.paths, "backup: imported");
        Ok(Some(name))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn set_notification_plan(state: State<'_, Arc<AppState>>, plan: NotificationPlan, enabled: bool, show_details: bool) {
    state.scheduler.set_plan(plan, enabled, show_details);
}

#[tauri::command]
fn notify(app: AppHandle, title: String, body: String) -> Result<(), String> {
    let title: String = title.chars().take(100).collect();
    let body: String = body.chars().take(300).collect();
    app.notification().builder().title(title).body(body).show().map_err(|e| e.to_string())
}

fn spawn_notification_loop(app: AppHandle, state: Arc<AppState>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(15));
        if state.shutdown_done.load(Ordering::SeqCst) {
            break;
        }
        let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
        for due in state.scheduler.take_due(now, state.bridge.has_session()) {
            let _ = app.notification().builder().title(&due.title).body(&due.body).show();
        }
    });
}

/// Locks the database and stops the backend container. Idempotent.
fn shutdown(state: &AppState) {
    if state.shutdown_done.swap(true, Ordering::SeqCst) {
        return;
    }
    log_line(&state.paths, "shutdown: begin");
    if state.bridge.has_session() {
        let _ = state.bridge.request("POST", "/api/auth/lock", None);
    }
    if state.backend_started.load(Ordering::SeqCst) && !state.external_backend {
        if let Some(bin) = docker::find_docker() {
            let docker = docker::Docker::new(bin, &state.paths, &state.version);
            match docker.stop() {
                Ok(()) => log_line(&state.paths, "shutdown: backend stopped"),
                Err(_) => log_line(&state.paths, "shutdown: backend stop failed"),
            }
        }
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let paths = AppPaths::resolve().expect("HOME must be set");
    let state = Arc::new(AppState {
        paths,
        version: env!("CARGO_PKG_VERSION").to_string(),
        bridge: Bridge::new(),
        scheduler: Scheduler::default(),
        external_backend: std::env::var("KA_EXTERNAL_BACKEND").map(|v| v == "1").unwrap_or(false),
        backend_started: AtomicBool::new(false),
        shutdown_done: AtomicBool::new(false),
        startup_lock: Mutex::new(()),
    });
    let loop_state = state.clone();
    let exit_state = state.clone();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            start_backend,
            app_info,
            api_request,
            export_backup,
            import_backup,
            set_notification_plan,
            notify
        ])
        .setup(move |app| {
            spawn_notification_loop(app.handle().clone(), loop_state.clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Kontakte-Akte");

    app.run(move |handle, event| match event {
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => show_main_window(handle),
        RunEvent::ExitRequested { api, .. } => {
            if !exit_state.shutdown_done.load(Ordering::SeqCst) {
                api.prevent_exit();
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.hide();
                }
                let state = exit_state.clone();
                let handle = handle.clone();
                std::thread::spawn(move || {
                    shutdown(&state);
                    handle.exit(0);
                });
            }
        }
        RunEvent::Exit => shutdown(&exit_state),
        _ => {}
    });
}

#[cfg(test)]
mod tests {
    use super::valid_backup_name;

    #[test]
    fn backup_names_are_restricted() {
        assert!(valid_backup_name("kontakte-akte-20261112-101010.kabackup"));
        for bad in ["../x.kabackup", "a/b.kabackup", ".hidden.kabackup", "x.db", "x y.kabackup"] {
            assert!(!valid_backup_name(bad), "{bad}");
        }
    }
}
