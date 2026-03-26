use crate::history::History;
use crate::ipc;
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::State;

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {e}"))
}

#[tauri::command]
pub fn get_history() -> History {
    History::load()
}

#[tauri::command]
pub fn record_open(path: String) -> Result<(), String> {
    let mut history = History::load();
    history.record_open(&path);
    history.save()
}

#[tauri::command]
pub fn pin_file(path: String) -> Result<(), String> {
    let mut history = History::load();
    history.pin(&path);
    history.save()
}

#[tauri::command]
pub fn unpin_file(path: String) -> Result<(), String> {
    let mut history = History::load();
    history.unpin(&path);
    history.save()
}

#[tauri::command]
pub fn resolve_path(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    if p.is_absolute() {
        Ok(path)
    } else {
        std::env::current_dir()
            .map(|cwd| cwd.join(&p).to_string_lossy().to_string())
            .map_err(|e| format!("Failed to resolve path: {e}"))
    }
}

#[tauri::command]
pub fn get_git_root(path: String) -> Option<String> {
    let dir = Path::new(&path).parent()?;
    let output = Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .current_dir(dir)
        .output()
        .ok()?;

    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        None
    }
}

#[tauri::command]
pub fn get_initial_file(state: State<'_, AppState>) -> Option<String> {
    state.initial_file.lock().unwrap().take()
}

#[tauri::command]
pub fn watch_file(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut watcher = state.file_watcher.lock().unwrap();
    if let Some(ref mut w) = *watcher {
        w.watch(std::path::Path::new(&path))
    } else {
        Err("File watcher not initialized".into())
    }
}

#[tauri::command]
pub fn unwatch_file(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut watcher = state.file_watcher.lock().unwrap();
    if let Some(ref mut w) = *watcher {
        w.unwatch(std::path::Path::new(&path))
    } else {
        Err("File watcher not initialized".into())
    }
}

#[derive(Deserialize, Serialize)]
pub struct Comment {
    pub file: String,
    pub session_id: String,
    pub heading: String,
    pub selected_text: String,
    pub content_type: String,
    pub comment: String,
}

#[tauri::command]
pub async fn send_comment(state: State<'_, AppState>, comment: Comment) -> Result<(), String> {
    let json = serde_json::to_string(&comment).map_err(|e| e.to_string())?;
    let message = format!("comment:{json}\n");
    ipc::send_to_subscriber(&state.subscribers, &comment.session_id, &message).await;
    Ok(())
}

#[tauri::command]
pub async fn get_sessions(state: State<'_, AppState>) -> Result<Vec<ipc::SessionInfo>, String> {
    let registry = state.session_registry.lock().await;
    Ok(registry.values().cloned().collect())
}
