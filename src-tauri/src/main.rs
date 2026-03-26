// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();

    // --mcp mode: exec the TypeScript channel script instead of launching GUI
    if args.iter().any(|a| a == "--mcp") {
        let channel_script = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.to_path_buf()))
            .map(|dir| dir.join("../../../channel/markdown-reader-channel.ts"))
            .unwrap_or_else(|| std::path::PathBuf::from("channel/markdown-reader-channel.ts"));

        // Try bun first, then npx tsx
        let status = std::process::Command::new("bun")
            .arg("run")
            .arg(&channel_script)
            .status()
            .or_else(|_| {
                std::process::Command::new("npx")
                    .args(["tsx", channel_script.to_str().unwrap_or("")])
                    .status()
            });

        match status {
            Ok(s) => std::process::exit(s.code().unwrap_or(1)),
            Err(e) => {
                eprintln!("Failed to launch channel script: {e}");
                std::process::exit(1);
            }
        }
    }

    // Daemonize: fork and detach from terminal so the app runs independently
    if !cfg!(debug_assertions) {
        unsafe {
            let pid = libc::fork();
            if pid > 0 {
                // Parent: exit immediately, returning control to the terminal
                std::process::exit(0);
            } else if pid == 0 {
                // Child: create new session to detach from terminal
                libc::setsid();
            }
            // If fork fails (pid < 0), just continue in the current process
        }
    }

    app_lib::run();
}
