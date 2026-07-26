use crate::history::History;
use crate::ipc;
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use tauri::State;

const FS_DEADLINE: std::time::Duration = std::time::Duration::from_secs(5);

/// Runs blocking filesystem work off the IPC thread and gives up waiting after
/// `timeout`. A stalled `open()` is uninterruptible — the worker thread stays
/// parked until the kernel releases it, but the caller (the UI) is freed.
fn with_deadline<T, F>(what: &str, timeout: std::time::Duration, f: F) -> Result<T, String>
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
{
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(f());
    });
    rx.recv_timeout(timeout)
        .map_err(|_| format!("{what}: unresponsive after {:?}", timeout))
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    with_deadline("read_file", FS_DEADLINE, move || {
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {e}"))
    })?
}

#[tauri::command]
pub fn read_image_as_data_url(path: String) -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};

    let read_path = path.clone();
    let bytes = with_deadline("read_image", FS_DEADLINE, move || {
        std::fs::read(&read_path).map_err(|e| format!("Failed to read image: {e}"))
    })??;

    // Infer MIME type from extension
    let mime = match std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("svg") => "image/svg+xml",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        Some("ico") => "image/x-icon",
        Some("avif") => "image/avif",
        _ => "application/octet-stream",
    };

    let encoded = general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
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
pub fn pin_dir(path: String) -> Result<(), String> {
    let mut history = History::load();
    history.pin_dir(&path);
    history.save()
}

#[tauri::command]
pub fn unpin_dir(path: String) -> Result<(), String> {
    let mut history = History::load();
    history.unpin_dir(&path);
    history.save()
}

#[tauri::command]
pub fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Home directory not found".to_string())
}

#[derive(Serialize)]
pub struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
}

const SKIP_DIRS: &[&str] = &["node_modules"];
const HAS_MD_BUDGET: usize = 2000;

fn should_skip_name(name: &str) -> bool {
    name.starts_with('.') || SKIP_DIRS.contains(&name)
}

/// Mount points of volumes the kernel does not report as local (NFS, SMB, FUSE…).
/// Read with `MNT_NOWAIT` so an unresponsive volume can never stall this call:
/// the flags come from the kernel's mount table, the volumes are never touched.
#[cfg(unix)]
fn non_local_mounts() -> Vec<std::path::PathBuf> {
    use std::os::unix::ffi::OsStrExt;

    let count = unsafe { libc::getfsstat(std::ptr::null_mut(), 0, libc::MNT_NOWAIT) };
    if count <= 0 {
        return Vec::new();
    }
    let mut buf: Vec<libc::statfs> = Vec::with_capacity(count as usize);
    let size = std::mem::size_of::<libc::statfs>() * count as usize;
    let written =
        unsafe { libc::getfsstat(buf.as_mut_ptr(), size as libc::c_int, libc::MNT_NOWAIT) };
    if written <= 0 {
        return Vec::new();
    }
    unsafe { buf.set_len(written as usize) };

    buf.iter()
        .filter(|fs| (fs.f_flags & libc::MNT_LOCAL as u32) == 0)
        .map(|fs| {
            let mount = unsafe { std::ffi::CStr::from_ptr(fs.f_mntonname.as_ptr()) };
            std::path::PathBuf::from(std::ffi::OsStr::from_bytes(mount.to_bytes()))
        })
        .collect()
}

#[cfg(not(unix))]
fn non_local_mounts() -> Vec<std::path::PathBuf> {
    Vec::new()
}

fn is_on_non_local_volume(path: &std::path::Path, mounts: &[std::path::PathBuf]) -> bool {
    mounts.iter().any(|mount| path.starts_with(mount))
}

fn is_md_file(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown")
}

/// Recursively checks whether a directory contains at least one `.md` /
/// `.markdown` file, applying the same skip filters as `list_directory`.
/// Uses a visit budget to bound worst-case runtime on huge non-md trees;
/// if the budget is exhausted, returns `true` (conservative: keep dir visible).
fn has_markdown(
    dir: &std::path::Path,
    remaining: &mut usize,
    non_local: &[std::path::PathBuf],
) -> bool {
    if *remaining == 0 {
        return true;
    }
    if is_on_non_local_volume(dir, non_local) {
        return false;
    }
    *remaining -= 1;
    let read = match std::fs::read_dir(dir) {
        Ok(r) => r,
        Err(_) => return false,
    };
    for entry in read.flatten() {
        if *remaining == 0 {
            return true;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if should_skip_name(&name) {
            continue;
        }
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            if has_markdown(&entry.path(), remaining, non_local) {
                return true;
            }
        } else if is_md_file(&name) {
            return true;
        }
    }
    false
}

/// Returns the single visible child of `dir`, or `None` if there are zero or
/// two-or-more visible children. Early-exits on the second match.
fn only_visible_child(
    dir: &std::path::Path,
    non_local: &[std::path::PathBuf],
) -> Option<(String, std::path::PathBuf, bool)> {
    let read = std::fs::read_dir(dir).ok()?;
    let mut found: Option<(String, std::path::PathBuf, bool)> = None;
    for entry in read.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if should_skip_name(&name) {
            continue;
        }
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        if file_type.is_symlink() {
            continue;
        }
        let is_dir = file_type.is_dir();
        if is_dir {
            let mut budget = HAS_MD_BUDGET;
            if !has_markdown(&entry.path(), &mut budget, non_local) {
                continue;
            }
        } else if !is_md_file(&name) {
            continue;
        }
        if found.is_some() {
            return None;
        }
        found = Some((name, entry.path(), is_dir));
    }
    found
}

/// Walks through single-child dir chains, collapsing them into a slash-joined
/// display name. Stops when a dir has !=1 visible children or the single child
/// is a file. Returns (display_name, deepest_dir_path).
fn compact_dir(
    start_name: &str,
    start_path: &std::path::Path,
    non_local: &[std::path::PathBuf],
) -> (String, std::path::PathBuf) {
    let mut name = start_name.to_string();
    let mut path = start_path.to_path_buf();
    while let Some((child_name, child_path, child_is_dir)) = only_visible_child(&path, non_local) {
        if !child_is_dir {
            break;
        }
        name.push('/');
        name.push_str(&child_name);
        path = child_path;
    }
    (name, path)
}

#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    with_deadline("list_directory", FS_DEADLINE, move || {
        list_directory_within(std::path::Path::new(&path), &non_local_mounts())
    })?
}

fn list_directory_within(
    path: &std::path::Path,
    non_local: &[std::path::PathBuf],
) -> Result<Vec<DirEntry>, String> {
    let read = std::fs::read_dir(path).map_err(|e| format!("Failed to read directory: {e}"))?;
    let mut result = Vec::new();
    for entry in read.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if should_skip_name(&name) {
            continue;
        }
        if is_on_non_local_volume(&entry.path(), non_local) {
            continue;
        }
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        if file_type.is_symlink() {
            continue;
        }
        let is_dir = file_type.is_dir();
        if is_dir {
            let mut budget = HAS_MD_BUDGET;
            if !has_markdown(&entry.path(), &mut budget, non_local) {
                continue;
            }
            let (display_name, target_path) = compact_dir(&name, &entry.path(), non_local);
            result.push(DirEntry {
                name: display_name,
                path: target_path.to_string_lossy().to_string(),
                is_dir: true,
            });
            continue;
        }
        if !is_md_file(&name) {
            continue;
        }
        let full_path = entry.path().to_string_lossy().to_string();
        result.push(DirEntry {
            name,
            path: full_path,
            is_dir,
        });
    }
    result.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(result)
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
pub fn get_initial_file(state: State<'_, AppState>) -> Option<String> {
    state.initial_file.lock().unwrap().take()
}

#[derive(Serialize)]
pub struct PendingOpenPayload {
    pub path: String,
    pub session_id: Option<String>,
}

/// Mark the frontend as ready to receive open events and return any opens that
/// queued up during startup (cold-start race fix). The frontend calls this once
/// its event listeners are attached; from then on opens are emitted live.
#[tauri::command]
pub fn frontend_ready(state: State<'_, AppState>) -> Vec<PendingOpenPayload> {
    let mut q = state.open_queue.lock().unwrap();
    q.ready = true;
    q.pending
        .drain(..)
        .map(|p| PendingOpenPayload {
            path: p.path,
            session_id: p.session_id,
        })
        .collect()
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

#[tauri::command]
pub fn watch_dir(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut watcher = state.dir_watcher.lock().unwrap();
    if let Some(ref mut w) = *watcher {
        w.watch(std::path::Path::new(&path))
    } else {
        Err("Dir watcher not initialized".into())
    }
}

#[tauri::command]
pub fn unwatch_dir(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut watcher = state.dir_watcher.lock().unwrap();
    if let Some(ref mut w) = *watcher {
        w.unwatch(std::path::Path::new(&path))
    } else {
        Err("Dir watcher not initialized".into())
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

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    Command::new("xdg-open")
        .arg(&url)
        .spawn()
        .map_err(|e| format!("Failed to open URL: {e}"))?;
    Ok(())
}

/// Toggle whether the OS treats the window background as draggable.
/// On macOS, when enabled, tao's NSWindow `sendEvent` override calls
/// `performWindowDragWithEvent` synchronously on `LeftMouseDown`, which is
/// the only reliable way to drag the window when it has focus. Frontend
/// flips this on `mouseenter`/`mouseleave` of `[data-tauri-drag-region]`
/// elements so non-titlebar areas keep normal click/text-selection behavior.
#[tauri::command]
pub fn set_window_movable(window: tauri::Window, movable: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let ns_window = window.ns_window().map_err(|e| e.to_string())?;
        use objc2::msg_send;
        use objc2::runtime::AnyObject;
        unsafe {
            let _: () = msg_send![
                ns_window as *mut AnyObject,
                setMovableByWindowBackground: movable
            ];
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, movable);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};

    #[test]
    fn a_path_under_a_non_local_mount_is_detected() {
        let mounts = vec![PathBuf::from("/Users/someone/Remote")];
        assert!(is_on_non_local_volume(
            Path::new("/Users/someone/Remote/docs"),
            &mounts
        ));
    }

    #[test]
    fn the_mount_point_itself_is_detected() {
        let mounts = vec![PathBuf::from("/Users/someone/Remote")];
        assert!(is_on_non_local_volume(
            Path::new("/Users/someone/Remote"),
            &mounts
        ));
    }

    #[test]
    fn a_sibling_sharing_a_textual_prefix_is_not_detected() {
        let mounts = vec![PathBuf::from("/Users/someone/Remote")];
        assert!(!is_on_non_local_volume(
            Path::new("/Users/someone/RemoteBackup"),
            &mounts
        ));
    }

    #[test]
    fn a_local_path_is_not_detected() {
        let mounts = vec![PathBuf::from("/Users/someone/Remote")];
        assert!(!is_on_non_local_volume(
            Path::new("/Users/someone/dev/project"),
            &mounts
        ));
    }

    #[test]
    fn has_markdown_does_not_descend_into_a_non_local_volume() {
        let tmp = tempfile::tempdir().unwrap();
        let remote = tmp.path().join("remote");
        std::fs::create_dir(&remote).unwrap();
        std::fs::write(remote.join("doc.md"), "# hi").unwrap();

        let mounts = vec![remote.clone()];
        let mut budget = HAS_MD_BUDGET;
        assert!(!has_markdown(&remote, &mut budget, &mounts));

        let mut budget = HAS_MD_BUDGET;
        assert!(has_markdown(&remote, &mut budget, &[]));
    }

    #[test]
    fn list_directory_hides_a_non_local_volume_but_keeps_local_dirs() {
        let tmp = tempfile::tempdir().unwrap();
        let remote = tmp.path().join("remote");
        let local = tmp.path().join("local");
        std::fs::create_dir(&remote).unwrap();
        std::fs::create_dir(&local).unwrap();
        std::fs::write(remote.join("doc.md"), "# remote").unwrap();
        std::fs::write(local.join("doc.md"), "# local").unwrap();

        let mounts = vec![remote.clone()];
        let entries = list_directory_within(tmp.path(), &mounts).unwrap();
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();

        assert_eq!(names, vec!["local"]);

        let without_mounts = list_directory_within(tmp.path(), &[]).unwrap();
        let mut names: Vec<&str> = without_mounts.iter().map(|e| e.name.as_str()).collect();
        names.sort_unstable();
        assert_eq!(names, vec!["local", "remote"]);
    }

    #[test]
    fn non_local_mounts_never_touches_the_volumes_it_reports() {
        let start = std::time::Instant::now();
        let _ = non_local_mounts();
        assert!(start.elapsed() < std::time::Duration::from_millis(500));
    }
    #[test]
    fn with_deadline_returns_the_value_when_the_work_is_fast() {
        let got = with_deadline("fast", std::time::Duration::from_secs(5), || 42);
        assert_eq!(got, Ok(42));
    }

    #[test]
    fn with_deadline_gives_up_instead_of_waiting_forever() {
        let start = std::time::Instant::now();
        let got: Result<(), String> =
            with_deadline("slow", std::time::Duration::from_millis(50), || {
                std::thread::sleep(std::time::Duration::from_secs(30));
            });
        assert!(got.is_err());
        assert!(start.elapsed() < std::time::Duration::from_secs(2));
    }
}
