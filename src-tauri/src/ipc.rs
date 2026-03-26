use std::path::PathBuf;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{UnixListener, UnixStream};
use tokio::sync::mpsc;

const PING_MSG: &str = "__ping__";
const PONG_MSG: &str = "__pong__";

pub fn socket_path(workspace_id: u32) -> PathBuf {
    let runtime_dir = std::env::var("XDG_RUNTIME_DIR")
        .unwrap_or_else(|_| format!("/run/user/{}", unsafe { libc::getuid() }));
    PathBuf::from(runtime_dir).join(format!("md-reader-ws-{workspace_id}.sock"))
}

pub struct IpcServer {
    workspace_id: u32,
}

impl IpcServer {
    pub fn new(workspace_id: u32) -> Self {
        Self { workspace_id }
    }

    /// Start listening on the socket. Returns a receiver for incoming file paths.
    pub fn start(&self) -> Result<mpsc::UnboundedReceiver<String>, String> {
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
                    Ok((mut stream, _)) => {
                        let tx = tx.clone();
                        tokio::spawn(async move {
                            let mut buf = vec![0u8; 4096];
                            if let Ok(n) = AsyncReadExt::read(&mut stream, &mut buf).await {
                                let msg = String::from_utf8_lossy(&buf[..n]).to_string();
                                if msg == PING_MSG {
                                    let _ = stream.write_all(PONG_MSG.as_bytes()).await;
                                } else if !msg.is_empty() {
                                    let _ = tx.send(msg);
                                }
                            }
                        });
                    }
                    Err(_) => break,
                }
            }
        });

        Ok(rx)
    }
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
}
