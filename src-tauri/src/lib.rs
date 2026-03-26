mod commands;
mod history;
mod ipc;
mod watcher;
mod workspace;

use std::sync::Mutex;
use tauri::{Emitter, Manager};

pub struct AppState {
    pub initial_file: Mutex<Option<String>>,
    pub workspace_id: u32,
    pub file_watcher: Mutex<Option<watcher::FileWatcher>>,
}

pub fn run() {
    run_with_args(std::env::args().collect())
}

pub fn run_with_args(args: Vec<String>) {
    // Parse CLI argument
    let file_arg = args.get(1).cloned();

    // Resolve to absolute path
    let file_path = file_arg.map(|f| {
        let p = std::path::PathBuf::from(&f);
        if p.is_absolute() {
            f
        } else {
            std::env::current_dir()
                .map(|cwd| cwd.join(&p).to_string_lossy().to_string())
                .unwrap_or(f)
        }
    });

    // Detect workspace
    let workspace_id = workspace::get_current_workspace();

    // Check if instance already running on this workspace
    if let Some(ref path) = file_path {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        let already_running = rt.block_on(async {
            if ipc::IpcClient::ping(workspace_id).await {
                ipc::IpcClient::send(workspace_id, path).await.ok();
                true
            } else {
                ipc::IpcClient::cleanup_if_orphaned(workspace_id).await;
                false
            }
        });

        if already_running {
            return;
        }
    }

    tauri::Builder::default()
        .manage(AppState {
            initial_file: Mutex::new(file_path),
            workspace_id,
            file_watcher: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::get_history,
            commands::record_open,
            commands::pin_file,
            commands::unpin_file,
            commands::resolve_path,
            commands::get_git_root,
            commands::get_initial_file,
            commands::watch_file,
            commands::unwatch_file,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();

            // Set window icon from embedded PNG
            if let Some(window) = app.webview_windows().values().next() {
                let icon_bytes = include_bytes!("../icons/128x128.png");
                if let Ok(icon) = tauri::image::Image::from_bytes(icon_bytes) {
                    let _ = window.set_icon(icon);
                }
            }

            // Set up file watcher that emits events to frontend
            let watcher_handle = handle.clone();
            let fw = watcher::FileWatcher::new(move |path| {
                let _ = watcher_handle.emit("file-changed", path.to_string_lossy().to_string());
            });
            if let Ok(fw) = fw {
                let state = handle.state::<AppState>();
                *state.file_watcher.lock().unwrap() = Some(fw);
            }

            // Start IPC server for this workspace
            let ipc_server = ipc::IpcServer::new(workspace_id);
            let ipc_handle = handle.clone();
            // We need a tokio runtime for the IPC server
            std::thread::spawn(move || {
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .unwrap();
                rt.block_on(async {
                    if let Ok(mut rx) = ipc_server.start() {
                        while let Some(path) = rx.recv().await {
                            let _ = ipc_handle.emit("open-file", path);
                            // Focus the window
                            if let Some(window) = ipc_handle.webview_windows().values().next() {
                                let _ = window.set_focus();
                            }
                        }
                    }
                });
            });

            // Watch history.json for changes from other instances
            let history_path = dirs::data_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("~/.local/share"))
                .join("markdown-reader")
                .join("history.json");

            if history_path.exists() {
                let history_handle = handle.clone();
                let mut history_watcher = watcher::FileWatcher::new(move |_| {
                    let _ = history_handle.emit("history-changed", ());
                })
                .ok();
                if let Some(ref mut w) = history_watcher {
                    let _ = w.watch(&history_path);
                }
                // Keep watcher alive by leaking it (it needs to live for the app lifetime)
                std::mem::forget(history_watcher);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
