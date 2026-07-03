//! Script runner: spawns registered scripts and streams their output to the UI.

use serde::Serialize;
use std::collections::HashMap;
use std::io::Write;
use std::path::Path;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::Emitter;

use crate::scripts::{is_supported_extension, ScriptRegistry};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Windows flag preventing spawned processes from opening a console window.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// How often a watcher thread polls its process for exit.
const EXIT_POLL_INTERVAL: Duration = Duration::from_millis(200);

/// Process-wide suspend/resume through `ntdll`.
///
/// These functions are undocumented but have been stable for decades and are
/// what tools like Process Explorer use for their own Suspend action. The
/// pause is a hard freeze: the script is unaware of it, so on resume it may
/// find network connections dropped or sleep-based schedules shifted.
#[cfg(windows)]
mod suspend {
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;

    #[link(name = "ntdll")]
    extern "system" {
        fn NtSuspendProcess(process_handle: isize) -> i32;
        fn NtResumeProcess(process_handle: isize) -> i32;
    }

    /// Freezes every thread of the child process.
    pub fn suspend(child: &Child) -> Result<(), String> {
        let status = unsafe { NtSuspendProcess(child.as_raw_handle() as isize) };

        if status == 0 {
            Ok(())
        } else {
            Err(format!("Failed to pause the process (status {status})."))
        }
    }

    /// Resumes every thread of the child process.
    pub fn resume(child: &Child) -> Result<(), String> {
        let status = unsafe { NtResumeProcess(child.as_raw_handle() as isize) };

        if status == 0 {
            Ok(())
        } else {
            Err(format!("Failed to resume the process (status {status})."))
        }
    }
}

#[cfg(not(windows))]
mod suspend {
    use std::process::Child;

    /// Pause is only implemented for Windows (the project's current scope).
    pub fn suspend(_child: &Child) -> Result<(), String> {
        Err("Pausing is only supported on Windows.".into())
    }

    /// Resume is only implemented for Windows (the project's current scope).
    pub fn resume(_child: &Child) -> Result<(), String> {
        Err("Resuming is only supported on Windows.".into())
    }
}

/// A managed process, its input pipe, and its pause state.
pub struct RunningScript {
    child: Child,
    stdin: Option<ChildStdin>,
    paused: bool,
}

/// Processes currently running, keyed by script id.
#[derive(Default)]
pub struct RunningScripts(pub Arc<Mutex<HashMap<String, RunningScript>>>);

/// Running-state snapshot sent to the UI on initialization.
#[derive(Clone, Serialize)]
pub struct RunningInfo {
    id: String,
    paused: bool,
}

/// A chunk of output produced by a running script. Chunks are not
/// line-aligned: prompts printed without a trailing newline arrive too.
#[derive(Clone, Serialize)]
struct OutputChunk {
    id: String,
    stream: &'static str,
    chunk: String,
}

/// End-of-run notification carrying the script's exit code.
#[derive(Clone, Serialize)]
struct ExitedEvent {
    id: String,
    code: Option<i32>,
}

/// Builds the command to launch a script, chosen by its file extension.
///
/// `.py` is run unbuffered (`-u`) so output streams live. `.ps1` is run
/// without `-ExecutionPolicy Bypass`: if the local policy blocks the
/// script, that surfaces as a normal PowerShell error in the output pane
/// rather than being silently overridden. `.exe` is launched directly with
/// no interpreter, so it can run arbitrary compiled binaries, not just
/// readable/inspectable scripts.
fn launch_command(path: &Path) -> Result<Command, String> {
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase())
        .unwrap_or_default();

    if !is_supported_extension(&extension) {
        return Err(format!("Unsupported script type: .{extension}"));
    }

    let mut command = match extension.as_str() {
        "py" => {
            let mut command = Command::new("python");
            command.arg("-u");
            command
        }
        "ps1" => {
            let mut command = Command::new("powershell");
            command.args(["-NoLogo", "-NoProfile", "-File"]);
            command
        }
        "bat" | "cmd" => {
            let mut command = Command::new("cmd");
            command.arg("/c");
            command
        }
        "js" => Command::new("node"),
        // Requires a bash on PATH (Git Bash or WSL both provide one).
        "sh" => Command::new("bash"),
        "exe" => return Ok(Command::new(path)),
        _ => unreachable!("checked by is_supported_extension above"),
    };

    command.arg(path);

    Ok(command)
}

/// Forwards a script's output to the UI as `script-output` events, chunk by
/// chunk (not line by line), so input prompts printed without a trailing
/// newline still show up immediately.
fn stream_output<R: std::io::Read + Send + 'static>(
    app: tauri::AppHandle,
    id: String,
    stream: &'static str,
    mut reader: R,
) {
    thread::spawn(move || {
        let mut buffer = [0_u8; 4096];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(count) => {
                    let chunk = String::from_utf8_lossy(&buffer[..count]).to_string();

                    let _ = app.emit(
                        "script-output",
                        OutputChunk {
                            id: id.clone(),
                            stream,
                            chunk,
                        },
                    );
                }
            }
        }
    });
}

/// Polls a running process until it exits, then removes it from the
/// running map and notifies the UI with a `script-exited` event.
fn watch_exit(
    app: tauri::AppHandle,
    id: String,
    running: Arc<Mutex<HashMap<String, RunningScript>>>,
) {
    thread::spawn(move || loop {
        thread::sleep(EXIT_POLL_INTERVAL);

        let mut map = running.lock().unwrap();

        let Some(entry) = map.get_mut(&id) else {
            return;
        };

        match entry.child.try_wait() {
            Ok(None) => {
                // Still running, keep polling.
            }
            Ok(Some(status)) => {
                map.remove(&id);
                let _ = app.emit(
                    "script-exited",
                    ExitedEvent {
                        id,
                        code: status.code(),
                    },
                );
                return;
            }
            Err(_) => {
                map.remove(&id);
                let _ = app.emit("script-exited", ExitedEvent { id, code: None });
                return;
            }
        }
    });
}

/// Starts a registered script with the system Python interpreter.
#[tauri::command]
pub fn start_script(
    id: String,
    app: tauri::AppHandle,
    registry: tauri::State<ScriptRegistry>,
    running: tauri::State<RunningScripts>,
) -> Result<(), String> {
    let path = registry
        .0
        .lock()
        .unwrap()
        .iter()
        .find(|script| script.id == id)
        .map(|script| script.path.clone())
        .ok_or("Unknown script.")?;

    let mut map = running.0.lock().unwrap();

    if map.contains_key(&id) {
        return Err("This script is already running.".into());
    }

    let mut command = launch_command(Path::new(&path))?;
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to start the script: {error}"))?;

    if let Some(stdout) = child.stdout.take() {
        stream_output(app.clone(), id.clone(), "stdout", stdout);
    }

    if let Some(stderr) = child.stderr.take() {
        stream_output(app.clone(), id.clone(), "stderr", stderr);
    }

    let stdin = child.stdin.take();

    map.insert(
        id.clone(),
        RunningScript {
            child,
            stdin,
            paused: false,
        },
    );
    drop(map);

    watch_exit(app, id, Arc::clone(&running.0));

    Ok(())
}

/// Stops a running script; the watcher thread reports the exit to the UI.
#[tauri::command]
pub fn stop_script(id: String, running: tauri::State<RunningScripts>) -> Result<(), String> {
    let mut map = running.0.lock().unwrap();

    let entry = map.get_mut(&id).ok_or("This script is not running.")?;

    entry.child.kill().map_err(|error| error.to_string())
}

/// Stops every running script; the watcher threads report each exit.
#[tauri::command]
pub fn stop_all_scripts(running: tauri::State<RunningScripts>) -> Result<(), String> {
    let mut map = running.0.lock().unwrap();

    for entry in map.values_mut() {
        let _ = entry.child.kill();
    }

    Ok(())
}

/// Sends a line of input to a running script's stdin and echoes it to the
/// terminal as a `script-output` event with the `stdin` stream tag.
#[tauri::command]
pub fn send_input(
    id: String,
    text: String,
    app: tauri::AppHandle,
    running: tauri::State<RunningScripts>,
) -> Result<(), String> {
    let mut map = running.0.lock().unwrap();

    let entry = map.get_mut(&id).ok_or("This script is not running.")?;

    let stdin = entry
        .stdin
        .as_mut()
        .ok_or("This script's input is not available.")?;

    writeln!(stdin, "{text}").map_err(|error| error.to_string())?;
    stdin.flush().map_err(|error| error.to_string())?;

    let _ = app.emit(
        "script-output",
        OutputChunk {
            id,
            stream: "stdin",
            chunk: format!("{text}\n"),
        },
    );

    Ok(())
}

/// Kills a script's process if it is currently running (used when removing
/// a script from the registry); the watcher thread reports the exit.
pub fn kill_if_running(running: &RunningScripts, id: &str) {
    let mut map = running.0.lock().unwrap();

    if let Some(entry) = map.get_mut(id) {
        let _ = entry.child.kill();
    }
}

/// Freezes a running script's process until it is resumed or stopped.
#[tauri::command]
pub fn pause_script(id: String, running: tauri::State<RunningScripts>) -> Result<(), String> {
    let mut map = running.0.lock().unwrap();

    let entry = map.get_mut(&id).ok_or("This script is not running.")?;

    if entry.paused {
        return Err("This script is already paused.".into());
    }

    suspend::suspend(&entry.child)?;
    entry.paused = true;

    Ok(())
}

/// Resumes a paused script's process.
#[tauri::command]
pub fn resume_script(id: String, running: tauri::State<RunningScripts>) -> Result<(), String> {
    let mut map = running.0.lock().unwrap();

    let entry = map.get_mut(&id).ok_or("This script is not running.")?;

    if !entry.paused {
        return Err("This script is not paused.".into());
    }

    suspend::resume(&entry.child)?;
    entry.paused = false;

    Ok(())
}

/// Returns the running state of every managed script (for UI initialization).
#[tauri::command]
pub fn get_running_scripts(running: tauri::State<RunningScripts>) -> Vec<RunningInfo> {
    running
        .0
        .lock()
        .unwrap()
        .iter()
        .map(|(id, entry)| RunningInfo {
            id: id.clone(),
            paused: entry.paused,
        })
        .collect()
}
