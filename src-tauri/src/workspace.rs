use zbus::blocking::Connection;

/// Get the current GNOME workspace index via D-Bus (Mutter).
/// Falls back to workspace 0 if D-Bus is unavailable.
pub fn get_current_workspace() -> u32 {
    get_workspace_from_dbus().unwrap_or(0)
}

fn get_workspace_from_dbus() -> Result<u32, Box<dyn std::error::Error>> {
    let connection = Connection::session()?;
    let reply = connection.call_method(
        Some("org.gnome.Shell"),
        "/org/gnome/Shell",
        Some("org.gnome.Shell"),
        "Eval",
        &("global.workspace_manager.get_active_workspace_index()".to_string(),),
    )?;

    let (success, result): (bool, String) = reply.body().deserialize()?;
    if success {
        Ok(result.parse::<u32>().unwrap_or(0))
    } else {
        Ok(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_current_workspace_fallback() {
        // In test/CI environment, D-Bus is typically unavailable
        // so this should return 0 (fallback)
        let ws = get_current_workspace();
        // Just verify it doesn't panic and returns a valid value
        assert!(ws < 100);
    }
}
