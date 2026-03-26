use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub path: String,
    pub last_opened: DateTime<Utc>,
    pub open_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct History {
    pub version: u32,
    pub pinned: Vec<String>,
    pub entries: Vec<HistoryEntry>,
}

impl History {
    fn data_dir() -> PathBuf {
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("~/.local/share"))
            .join("markdown-reader")
    }

    fn file_path() -> PathBuf {
        Self::data_dir().join("history.json")
    }

    fn empty() -> Self {
        Self {
            version: 1,
            pinned: Vec::new(),
            entries: Vec::new(),
        }
    }

    pub fn load() -> Self {
        let path = Self::file_path();

        if !path.exists() {
            let history = Self::empty();
            let _ = history.save();
            return history;
        }

        let file = match OpenOptions::new().read(true).open(&path) {
            Ok(f) => f,
            Err(_) => return Self::empty(),
        };

        // flock shared for reading
        use std::os::unix::io::AsRawFd;
        unsafe {
            libc::flock(file.as_raw_fd(), libc::LOCK_SH);
        }

        let mut content = String::new();
        let mut reader = std::io::BufReader::new(&file);
        if reader.read_to_string(&mut content).is_err() {
            return Self::empty();
        }

        unsafe {
            libc::flock(file.as_raw_fd(), libc::LOCK_UN);
        }

        serde_json::from_str(&content).unwrap_or_else(|_| Self::empty())
    }

    pub fn save(&self) -> Result<(), String> {
        let dir = Self::data_dir();
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create data dir: {e}"))?;

        let path = Self::file_path();
        let file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&path)
            .map_err(|e| format!("Failed to open history file: {e}"))?;

        // flock exclusive for writing
        use std::os::unix::io::AsRawFd;
        unsafe {
            libc::flock(file.as_raw_fd(), libc::LOCK_EX);
        }

        let content =
            serde_json::to_string_pretty(self).map_err(|e| format!("Failed to serialize: {e}"))?;

        let mut writer = std::io::BufWriter::new(&file);
        writer
            .write_all(content.as_bytes())
            .map_err(|e| format!("Failed to write: {e}"))?;

        unsafe {
            libc::flock(file.as_raw_fd(), libc::LOCK_UN);
        }

        Ok(())
    }

    pub fn record_open(&mut self, path: &str) {
        if let Some(entry) = self.entries.iter_mut().find(|e| e.path == path) {
            entry.last_opened = Utc::now();
            entry.open_count += 1;
        } else {
            self.entries.push(HistoryEntry {
                path: path.to_string(),
                last_opened: Utc::now(),
                open_count: 1,
            });
        }
    }

    pub fn pin(&mut self, path: &str) {
        let path_str = path.to_string();
        if !self.pinned.contains(&path_str) {
            self.pinned.push(path_str);
        }
    }

    pub fn unpin(&mut self, path: &str) {
        self.pinned.retain(|p| p != path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn with_temp_data_dir<F: FnOnce()>(f: F) {
        let tmp = tempfile::tempdir().unwrap();
        env::set_var("XDG_DATA_HOME", tmp.path());
        f();
    }

    #[test]
    fn test_load_creates_file_if_absent() {
        with_temp_data_dir(|| {
            let history = History::load();
            assert_eq!(history.version, 1);
            assert!(history.entries.is_empty());
            assert!(history.pinned.is_empty());
        });
    }

    #[test]
    fn test_record_open_new_file() {
        with_temp_data_dir(|| {
            let mut history = History::load();
            history.record_open("/home/pol/test.md");
            assert_eq!(history.entries.len(), 1);
            assert_eq!(history.entries[0].path, "/home/pol/test.md");
            assert_eq!(history.entries[0].open_count, 1);
        });
    }

    #[test]
    fn test_record_open_existing_file() {
        with_temp_data_dir(|| {
            let mut history = History::load();
            history.record_open("/home/pol/test.md");
            history.record_open("/home/pol/test.md");
            assert_eq!(history.entries.len(), 1);
            assert_eq!(history.entries[0].open_count, 2);
        });
    }

    #[test]
    fn test_save_and_load_roundtrip() {
        with_temp_data_dir(|| {
            let mut history = History::load();
            history.record_open("/home/pol/test.md");
            history.pin("/home/pol/test.md");
            history.save().unwrap();

            let loaded = History::load();
            assert_eq!(loaded.entries.len(), 1);
            assert_eq!(loaded.pinned.len(), 1);
            assert_eq!(loaded.pinned[0], "/home/pol/test.md");
        });
    }

    #[test]
    fn test_pin_and_unpin() {
        with_temp_data_dir(|| {
            let mut history = History::empty();
            history.pin("/home/pol/a.md");
            history.pin("/home/pol/b.md");
            assert_eq!(history.pinned.len(), 2);

            // Pin duplicate is no-op
            history.pin("/home/pol/a.md");
            assert_eq!(history.pinned.len(), 2);

            history.unpin("/home/pol/a.md");
            assert_eq!(history.pinned.len(), 1);
            assert_eq!(history.pinned[0], "/home/pol/b.md");
        });
    }
}
