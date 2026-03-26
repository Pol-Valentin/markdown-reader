use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub struct FileWatcher {
    watcher: RecommendedWatcher,
    watched_paths: Arc<Mutex<HashSet<PathBuf>>>,
}

impl FileWatcher {
    /// Create a new FileWatcher. The callback is called with the path of the changed file,
    /// debounced to ~200ms.
    pub fn new<F>(on_change: F) -> Result<Self, String>
    where
        F: Fn(PathBuf) + Send + 'static,
    {
        let last_events: Arc<Mutex<std::collections::HashMap<PathBuf, Instant>>> =
            Arc::new(Mutex::new(std::collections::HashMap::new()));
        let debounce_duration = Duration::from_millis(200);

        let last_events_clone = last_events.clone();
        let watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    if event.kind.is_modify() || event.kind.is_create() {
                        for path in &event.paths {
                            let mut last = last_events_clone.lock().unwrap();
                            let now = Instant::now();
                            if let Some(prev) = last.get(path) {
                                if now.duration_since(*prev) < debounce_duration {
                                    last.insert(path.clone(), now);
                                    continue;
                                }
                            }
                            last.insert(path.clone(), now);
                            on_change(path.clone());
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
