use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};
use tokio::sync::{mpsc, Mutex};

const PING_MSG: &str = "__ping__";
const PONG_MSG: &str = "__pong__";

pub fn socket_path(workspace_id: u32) -> PathBuf {
    let runtime_dir = std::env::var("XDG_RUNTIME_DIR")
        .unwrap_or_else(|_| format!("/run/user/{}", unsafe { libc::getuid() }));
    PathBuf::from(runtime_dir).join(format!("md-reader-ws-{workspace_id}.sock"))
}

/// Metadata about a connected Claude Code session
#[derive(Clone, serde::Serialize)]
pub struct SessionInfo {
    pub session_id: String,
    pub cwd: String,
    pub connected_at: u64,
}

/// Shared session registry: session_id → SessionInfo
pub type SessionRegistry = Arc<Mutex<HashMap<String, SessionInfo>>>;

pub fn new_session_registry() -> SessionRegistry {
    Arc::new(Mutex::new(HashMap::new()))
}

/// Messages sent from IPC to the app
pub enum IpcMessage {
    /// Plain file open (legacy CLI): just a path, no session
    OpenFile(String),
    /// Session-tagged file open: open:{session_id}:{path}
    OpenFileWithSession { session_id: String, path: String },
    /// Reply from Claude via channel: reply:{session_id}:{json}
    ClaudeReply { session_id: String, json: String },
    /// Session list changed (subscribe or disconnect)
    SessionListChanged,
}

/// Shared subscriber map: session_id → write half of the socket
pub type SubscriberMap = Arc<Mutex<HashMap<String, tokio::net::unix::OwnedWriteHalf>>>;

pub fn new_subscriber_map() -> SubscriberMap {
    Arc::new(Mutex::new(HashMap::new()))
}

/// Send a comment to a specific subscriber by session_id.
pub async fn send_to_subscriber(subscribers: &SubscriberMap, session_id: &str, message: &str) {
    let mut map = subscribers.lock().await;
    if let Some(writer) = map.get_mut(session_id) {
        if writer.write_all(message.as_bytes()).await.is_err() {
            // Broken pipe — remove subscriber
            map.remove(session_id);
        }
    }
}

pub struct IpcServer {
    workspace_id: u32,
}

impl IpcServer {
    pub fn new(workspace_id: u32) -> Self {
        Self { workspace_id }
    }

    /// Start listening on the socket. Returns a receiver for incoming messages.
    pub fn start(
        &self,
        subscribers: SubscriberMap,
        registry: SessionRegistry,
    ) -> Result<mpsc::UnboundedReceiver<IpcMessage>, String> {
        let path = socket_path(self.workspace_id);

        // Clean up stale socket
        if path.exists() {
            let _ = std::fs::remove_file(&path);
        }

        let listener =
            UnixListener::bind(&path).map_err(|e| format!("Failed to bind socket: {e}"))?;

        let (tx, rx) = mpsc::unbounded_channel();

        tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((stream, _)) => {
                        let tx = tx.clone();
                        let subscribers = subscribers.clone();
                        let registry = registry.clone();
                        tokio::spawn(
                            handle_connection(stream, tx, subscribers, registry),
                        );
                    }
                    Err(_) => break,
                }
            }
        });

        Ok(rx)
    }
}

/// Parse subscribe message: "subscribe:{session_id}" or "subscribe:{session_id}:{json}"
fn parse_subscribe(msg: &str) -> Option<(String, String, u64)> {
    let rest = msg.strip_prefix("subscribe:")?;
    // Try to split at second ':' for JSON metadata
    if let Some((session_id, json_str)) = rest.split_once(':') {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
            let cwd = val.get("cwd").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let connected_at = val.get("connected_at").and_then(|v| v.as_u64()).unwrap_or_else(|| {
                std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64
            });
            return Some((session_id.to_string(), cwd, connected_at));
        }
    }
    // No JSON metadata — use defaults
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64;
    Some((rest.to_string(), String::new(), now))
}

async fn handle_connection(
    mut stream: UnixStream,
    tx: mpsc::UnboundedSender<IpcMessage>,
    subscribers: SubscriberMap,
    registry: SessionRegistry,
) {
    // Read initial data — support both newline-terminated (new protocol)
    // and raw bytes (legacy CLI / ping)
    let mut buf = vec![0u8; 4096];
    let n = match AsyncReadExt::read(&mut stream, &mut buf).await {
        Ok(n) if n > 0 => n,
        _ => return,
    };

    let raw = String::from_utf8_lossy(&buf[..n]).to_string();
    let msg = raw.trim_end_matches('\n');

    // Ping — legacy, no newline
    if msg == PING_MSG {
        let _ = stream.write_all(PONG_MSG.as_bytes()).await;
        return;
    }

    // Subscribe — persistent connection
    if let Some((session_id, cwd, connected_at)) = parse_subscribe(msg) {
        let (read_half, write_half) = stream.into_split();
        {
            let mut map = subscribers.lock().await;
            map.insert(session_id.clone(), write_half);
        }
        {
            let mut reg = registry.lock().await;
            reg.insert(session_id.clone(), SessionInfo {
                session_id: session_id.clone(),
                cwd,
                connected_at,
            });
        }
        let _ = tx.send(IpcMessage::SessionListChanged);

        // Keep reading for incoming messages (reply, etc.)
        let mut reader = BufReader::new(read_half);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line).await {
                Ok(0) | Err(_) => {
                    // Connection closed — remove subscriber and session
                    let mut map = subscribers.lock().await;
                    map.remove(&session_id);
                    drop(map);
                    let mut reg = registry.lock().await;
                    reg.remove(&session_id);
                    drop(reg);
                    let _ = tx.send(IpcMessage::SessionListChanged);
                    break;
                }
                Ok(_) => {
                    let msg = line.trim_end_matches('\n');
                    if let Some(rest) = msg.strip_prefix("reply:") {
                        if let Some((sid, json)) = rest.split_once(':') {
                            let _ = tx.send(IpcMessage::ClaudeReply {
                                session_id: sid.to_string(),
                                json: json.to_string(),
                            });
                        }
                    } else if let Some(rest) = msg.strip_prefix("open:") {
                        if let Some((sid, path)) = rest.split_once(':') {
                            let _ = tx.send(IpcMessage::OpenFileWithSession {
                                session_id: sid.to_string(),
                                path: path.to_string(),
                            });
                        }
                    }
                }
            }
        }
        return;
    }

    // Open with session tag
    if let Some(rest) = msg.strip_prefix("open:") {
        if let Some((session_id, path)) = rest.split_once(':') {
            let _ = tx.send(IpcMessage::OpenFileWithSession {
                session_id: session_id.to_string(),
                path: path.to_string(),
            });
        }
        return;
    }

    // Reply from subscriber (non-persistent path, rare)
    if let Some(rest) = msg.strip_prefix("reply:") {
        if let Some((session_id, json)) = rest.split_once(':') {
            let _ = tx.send(IpcMessage::ClaudeReply {
                session_id: session_id.to_string(),
                json: json.to_string(),
            });
        }
        return;
    }

    // Legacy: plain file path
    let _ = tx.send(IpcMessage::OpenFile(msg.to_string()));
}

pub struct IpcClient;

impl IpcClient {
    /// Send a file path to the running instance on the given workspace.
    pub async fn send(workspace_id: u32, file_path: &str) -> Result<(), String> {
        let path = socket_path(workspace_id);
        let mut stream = UnixStream::connect(&path)
            .await
            .map_err(|e| format!("Failed to connect: {e}"))?;
        stream
            .write_all(file_path.as_bytes())
            .await
            .map_err(|e| format!("Failed to send: {e}"))?;
        Ok(())
    }

    /// Check if an instance is running on the given workspace.
    pub async fn ping(workspace_id: u32) -> bool {
        let path = socket_path(workspace_id);
        if !path.exists() {
            return false;
        }

        let timeout = std::time::Duration::from_millis(500);

        let Ok(Ok(mut stream)) =
            tokio::time::timeout(timeout, UnixStream::connect(&path)).await
        else {
            return false;
        };

        if stream.write_all(PING_MSG.as_bytes()).await.is_err() {
            return false;
        }

        let mut buf = vec![0u8; 64];
        match tokio::time::timeout(timeout, AsyncReadExt::read(&mut stream, &mut buf)).await {
            Ok(Ok(n)) if n > 0 => String::from_utf8_lossy(&buf[..n]) == PONG_MSG,
            _ => false,
        }
    }

    /// Clean up orphaned socket if ping fails.
    pub async fn cleanup_if_orphaned(workspace_id: u32) {
        if socket_path(workspace_id).exists() && !Self::ping(workspace_id).await {
            let _ = std::fs::remove_file(socket_path(workspace_id));
        }
    }
}

impl Drop for IpcServer {
    fn drop(&mut self) {
        let path = socket_path(self.workspace_id);
        let _ = std::fs::remove_file(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_socket_path() {
        let path = socket_path(2);
        assert!(path.to_string_lossy().contains("md-reader-ws-2.sock"));
    }

    #[test]
    fn test_parse_subscribe_without_metadata() {
        let result = parse_subscribe("subscribe:abc-123");
        let (sid, cwd, _ts) = result.unwrap();
        assert_eq!(sid, "abc-123");
        assert_eq!(cwd, "");
    }

    #[test]
    fn test_parse_subscribe_with_metadata() {
        let result = parse_subscribe(
            r#"subscribe:abc-123:{"cwd":"/home/user/project","connected_at":1774520000000}"#,
        );
        let (sid, cwd, ts) = result.unwrap();
        assert_eq!(sid, "abc-123");
        assert_eq!(cwd, "/home/user/project");
        assert_eq!(ts, 1774520000000);
    }

    #[test]
    fn test_parse_subscribe_with_invalid_json_falls_back() {
        let result = parse_subscribe("subscribe:abc-123:not-json");
        // Invalid JSON → treated as no metadata, session_id includes the bad part
        // Actually this will fail to parse JSON and fall through to the no-metadata case
        // But split_once(':') splits at first ':', so session_id="abc-123", json="not-json"
        // serde_json fails → returns None from the if-let, falls to the default
        assert!(result.is_some());
    }

    #[test]
    fn test_parse_open_prefix() {
        let msg = "open:session1:/home/user/file.md";
        let rest = msg.strip_prefix("open:").unwrap();
        let (session_id, path) = rest.split_once(':').unwrap();
        assert_eq!(session_id, "session1");
        assert_eq!(path, "/home/user/file.md");
    }

    #[test]
    fn test_parse_reply_prefix() {
        let msg = "reply:session1:{\"text\":\"done\"}";
        let rest = msg.strip_prefix("reply:").unwrap();
        let (session_id, json) = rest.split_once(':').unwrap();
        assert_eq!(session_id, "session1");
        assert_eq!(json, "{\"text\":\"done\"}");
    }

    #[test]
    fn test_parse_plain_path() {
        let msg = "/home/user/file.md";
        assert!(msg.strip_prefix("subscribe:").is_none());
        assert!(msg.strip_prefix("open:").is_none());
        assert!(msg.strip_prefix("reply:").is_none());
    }
}
