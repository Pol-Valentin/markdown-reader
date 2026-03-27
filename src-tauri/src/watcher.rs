use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub struct FileWatcher {
    watcher: RecommendedWatcher,
    watched_paths: Arc<Mutex<HashSet<PathBuf>>>,
}

impl FileWatcher {
    /// Create a new FileWatcher. The callback is called with the path of the changed file,
    /// debounced: waits 300ms after the last event before firing.
    pub fn new<F>(on_change: F) -> Result<Self, String>
    where
        F: Fn(PathBuf) + Send + Sync + 'static,
    {
        let pending: Arc<Mutex<std::collections::HashMap<PathBuf, std::time::Instant>>> =
            Arc::new(Mutex::new(std::collections::HashMap::new()));
        let debounce_ms = 300u64;

        let pending_clone = pending.clone();
        let on_change = Arc::new(on_change);

        // Polling thread: checks every 100ms if any pending path has been stable long enough
        let on_change_poll = on_change.clone();
        let pending_poll = pending.clone();
        std::thread::spawn(move || {
            loop {
                std::thread::sleep(Duration::from_millis(100));
                let now = std::time::Instant::now();
                let mut to_fire = Vec::new();
                {
                    let mut map = pending_poll.lock().unwrap();
                    map.retain(|path, instant| {
                        if now.duration_since(*instant) >= Duration::from_millis(debounce_ms) {
                            to_fire.push(path.clone());
                            false
                        } else {
                            true
                        }
                    });
                }
                for path in to_fire {
                    on_change_poll(path);
                }
            }
        });

        let watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    if event.kind.is_modify() || event.kind.is_create() {
                        let mut map = pending_clone.lock().unwrap();
                        let now = std::time::Instant::now();
                        for path in &event.paths {
                            map.insert(path.clone(), now);
                        }
                    }
                }
            },
            Config::default(),
        )
        .map_err(|e| format!("Failed to create watcher: {e}"))?;

        Ok(Self {
            watcher,
            watched_paths: Arc::new(Mutex::new(HashSet::new())),
        })
    }

    pub fn watch(&mut self, path: &Path) -> Result<(), String> {
        let canonical = path
            .canonicalize()
            .map_err(|e| format!("Failed to canonicalize: {e}"))?;

        let mut paths = self.watched_paths.lock().unwrap();
        if paths.contains(&canonical) {
            return Ok(());
        }

        self.watcher
            .watch(&canonical, RecursiveMode::NonRecursive)
            .map_err(|e| format!("Failed to watch: {e}"))?;
        paths.insert(canonical);
        Ok(())
    }

    pub fn unwatch(&mut self, path: &Path) -> Result<(), String> {
        let canonical = path
            .canonicalize()
            .map_err(|e| format!("Failed to canonicalize: {e}"))?;

        let mut paths = self.watched_paths.lock().unwrap();
        if paths.remove(&canonical) {
            self.watcher
                .unwatch(&canonical)
                .map_err(|e| format!("Failed to unwatch: {e}"))?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};

    #[test]
    fn test_watch_and_unwatch() {
        let changed = Arc::new(AtomicBool::new(false));
        let changed_clone = changed.clone();

        let mut fw = FileWatcher::new(move |_| {
            changed_clone.store(true, Ordering::SeqCst);
        })
        .unwrap();

        let tmp = tempfile::NamedTempFile::new().unwrap();
        let path = tmp.path().to_path_buf();

        assert!(fw.watch(&path).is_ok());
        assert!(fw.unwatch(&path).is_ok());
        // Double unwatch should not error
        assert!(fw.unwatch(&path).is_ok());
    }
}
