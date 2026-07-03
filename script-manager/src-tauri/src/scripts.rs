//! Script registry: the persistent list of scripts the manager knows about.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

/// File extensions the manager knows how to run, matched case-insensitively.
/// Shared with `runner::launch_command`, which picks the interpreter for
/// each of these.
pub const SUPPORTED_EXTENSIONS: &[&str] = &["py", "ps1", "bat", "cmd", "js", "sh", "exe"];

/// Whether an extension (without the leading dot) is a supported script type.
pub fn is_supported_extension(extension: &str) -> bool {
    SUPPORTED_EXTENSIONS.contains(&extension.to_lowercase().as_str())
}

/// A script registered in the manager, identified by a stable id.
#[derive(Clone, Serialize, Deserialize)]
pub struct Script {
    pub id: String,
    pub name: String,
    pub path: String,
}

/// In-memory registry state, persisted to `scripts.json` in the app data directory.
#[derive(Default)]
pub struct ScriptRegistry(pub Mutex<Vec<Script>>);

/// Returns the path of the persisted registry file, creating the data directory if needed.
fn registry_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;

    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;

    Ok(dir.join("scripts.json"))
}

/// Loads the persisted registry, or an empty list when none exists yet.
pub fn load_scripts(app: &tauri::AppHandle) -> Vec<Script> {
    let Ok(file) = registry_file(app) else {
        return Vec::new();
    };

    let Ok(content) = fs::read_to_string(&file) else {
        return Vec::new();
    };

    serde_json::from_str(&content).unwrap_or_default()
}

/// Persists the registry to disk.
fn save_scripts(app: &tauri::AppHandle, scripts: &[Script]) -> Result<(), String> {
    let file = registry_file(app)?;
    let content = serde_json::to_string_pretty(scripts).map_err(|error| error.to_string())?;

    fs::write(&file, content).map_err(|error| error.to_string())
}

/// Removes a script from the registry, stopping it first if it is running,
/// and returns the updated list. The script file itself is left untouched.
#[tauri::command]
pub fn remove_script(
    id: String,
    app: tauri::AppHandle,
    state: tauri::State<ScriptRegistry>,
    running: tauri::State<crate::runner::RunningScripts>,
) -> Result<Vec<Script>, String> {
    crate::runner::kill_if_running(&running, &id);

    let mut scripts = state.0.lock().unwrap();

    scripts.retain(|script| script.id != id);
    save_scripts(&app, &scripts)?;

    Ok(scripts.clone())
}

/// Returns all registered scripts.
#[tauri::command]
pub fn get_scripts(state: tauri::State<ScriptRegistry>) -> Vec<Script> {
    state.0.lock().unwrap().clone()
}

/// Registers a script by path and returns the updated list.
#[tauri::command]
pub fn add_script(
    path: String,
    app: tauri::AppHandle,
    state: tauri::State<ScriptRegistry>,
) -> Result<Vec<Script>, String> {
    let script_path = Path::new(&path);

    let is_supported = script_path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(is_supported_extension)
        .unwrap_or(false);

    if !is_supported {
        return Err(format!(
            "Unsupported file type. Supported: {}.",
            SUPPORTED_EXTENSIONS
                .iter()
                .map(|ext| format!(".{ext}"))
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }

    if !script_path.is_file() {
        return Err("The selected file does not exist.".into());
    }

    let mut scripts = state.0.lock().unwrap();

    if scripts.iter().any(|script| script.path == path) {
        return Err("This script is already in the list.".into());
    }

    let name = script_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("script")
        .to_string();

    let id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis()
        .to_string();

    scripts.push(Script { id, name, path });
    save_scripts(&app, &scripts)?;

    Ok(scripts.clone())
}
