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
    pub dir_watcher: Mutex<Option<watcher::DirWatcher>>,
    pub subscribers: ipc::SubscriberMap,
    pub session_registry: ipc::SessionRegistry,
    /// Opens that arrived (via IPC or macOS Apple Events) before the webview
    /// finished registering its listeners. Drained once the frontend is ready.
    pub open_queue: Mutex<OpenQueue>,
}

/// A file-open request waiting to be delivered to the frontend.
pub struct PendingOpen {
    pub path: String,
    pub session_id: Option<String>,
}

/// Queue + readiness flag, guarded together so delivery and draining are atomic.
#[derive(Default)]
pub struct OpenQueue {
    pub ready: bool,
    pub pending: Vec<PendingOpen>,
}

/// Emit the right open event to the webview and bring the window forward.
fn emit_open(handle: &tauri::AppHandle, path: &str, session_id: Option<&str>) {
    match session_id {
        Some(sid) => {
            #[derive(serde::Serialize, Clone)]
            struct OpenFilePayload {
                path: String,
                session_id: String,
            }
            let _ = handle.emit(
                "open-file-session",
                OpenFilePayload {
                    path: path.to_string(),
                    session_id: sid.to_string(),
                },
            );
        }
        None => {
            let _ = handle.emit("open-file", path.to_string());
        }
    }
    if let Some(window) = handle.webview_windows().values().next() {
        let _ = window.set_focus();
    }
}

/// Deliver a file-open request. If the frontend is ready, emit immediately;
/// otherwise queue it so the frontend can drain it once its listeners exist.
/// This closes the cold-start race where the IPC socket binds (and the channel
/// pushes an `open:`) before `main.js` has registered its event listeners.
pub fn deliver_open(handle: &tauri::AppHandle, path: String, session_id: Option<String>) {
    let state = handle.state::<AppState>();
    let mut q = state.open_queue.lock().unwrap();
    if q.ready {
        drop(q);
        emit_open(handle, &path, session_id.as_deref());
    } else {
        q.pending.push(PendingOpen { path, session_id });
    }
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

    let subscribers = ipc::new_subscriber_map();
    let session_registry = ipc::new_session_registry();

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState {
            initial_file: Mutex::new(file_path),
            workspace_id,
            file_watcher: Mutex::new(None),
            dir_watcher: Mutex::new(None),
            subscribers: subscribers.clone(),
            session_registry: session_registry.clone(),
            open_queue: Mutex::new(OpenQueue::default()),
        })
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::read_image_as_data_url,
            commands::get_history,
            commands::record_open,
            commands::pin_file,
            commands::unpin_file,
            commands::pin_dir,
            commands::unpin_dir,
            commands::resolve_path,
            commands::get_home_dir,
            commands::list_directory,
            commands::get_initial_file,
            commands::watch_file,
            commands::unwatch_file,
            commands::watch_dir,
            commands::unwatch_dir,
            commands::send_comment,
            commands::get_sessions,
            commands::open_url,
            commands::set_window_movable,
            commands::frontend_ready,
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

            // Set up dir watcher (emits when entries are created/removed/renamed)
            let dir_watcher_handle = handle.clone();
            let dw = watcher::DirWatcher::new(move |dir_path| {
                let _ = dir_watcher_handle
                    .emit("dir-changed", dir_path.to_string_lossy().to_string());
            });
            if let Ok(dw) = dw {
                let state = handle.state::<AppState>();
                *state.dir_watcher.lock().unwrap() = Some(dw);
            }

            // Start IPC server for this workspace
            let ipc_server = ipc::IpcServer::new(workspace_id);
            let ipc_handle = handle.clone();
            let ipc_subscribers = subscribers.clone();
            let ipc_registry = session_registry.clone();
            // We need a tokio runtime for the IPC server
            std::thread::spawn(move || {
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .unwrap();
                rt.block_on(async {
                    if let Ok(mut rx) = ipc_server.start(ipc_subscribers, ipc_registry) {
                        while let Some(msg) = rx.recv().await {
                            match msg {
                                ipc::IpcMessage::OpenFile(path) => {
                                    deliver_open(&ipc_handle, path, None);
                                }
                                ipc::IpcMessage::OpenFileWithSession { session_id, path } => {
                                    deliver_open(&ipc_handle, path, Some(session_id));
                                }
                                ipc::IpcMessage::SessionListChanged => {
                                    let _ = ipc_handle.emit("sessions-changed", ());
                                }
                                ipc::IpcMessage::ClaudeReply { session_id, json } => {
                                    #[derive(serde::Serialize, Clone)]
                                    struct ReplyPayload {
                                        session_id: String,
                                        text: String,
                                    }
                                    // Parse json to extract text, or use raw json as text
                                    let text = serde_json::from_str::<serde_json::Value>(&json)
                                        .ok()
                                        .and_then(|v| v.get("text").and_then(|t| t.as_str()).map(String::from))
                                        .unwrap_or(json);
                                    let _ = ipc_handle.emit("claude-reply", ReplyPayload { session_id, text });
                                }
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
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // macOS delivers files opened from Finder / `open` / drag-onto-icon
            // as Apple Events surfaced here as RunEvent::Opened — NOT as argv.
            // Route them through the same queue as IPC opens.
            if let tauri::RunEvent::Opened { urls } = event {
                for url in urls {
                    let path = url
                        .to_file_path()
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_else(|_| url.to_string());
                    deliver_open(app_handle, path, None);
                }
            }
        });
}
