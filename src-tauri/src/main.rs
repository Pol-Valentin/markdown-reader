// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
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
