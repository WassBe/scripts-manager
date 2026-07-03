<h1 align="center">Scripts Manager</h1>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-2ba898?style=plastic">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-2ba898?style=plastic">
  <img alt="Built with Tauri" src="https://img.shields.io/badge/built%20with-Tauri-2ba898?style=plastic">
  <img alt="Built with React" src="https://img.shields.io/badge/built%20with-React-2ba898?style=plastic">
  <img alt="Last commit" src="https://img.shields.io/github/last-commit/WassBe/scripts-manager?style=plastic&color=2ba898">
</p>

A small Windows tray app that keeps all your scripts in one place.

## What it is

If you run a handful of scripts on your machine — scheduled jobs, macros, little automation tools — each one tends to live in its own terminal window. Five scripts, five windows, and no quick way to tell what's still running or why one died overnight.

Scripts Manager puts them all behind a single tray icon. Click it and you get one window where you can import scripts, start and stop them, pause them mid-run, watch their live output, and answer their input prompts. Close the window and everything keeps running in the background.

## What it does

- Runs Python, PowerShell, Batch, Node.js, Shell scripts and executables (`.py`, `.ps1`, `.bat`, `.cmd`, `.js`, `.sh`, `.exe`)
- Shows each script's state at a glance: running (green), paused (orange), stopped (grey)
- Streams stdout and stderr into a built-in terminal pane, filterable per script
- Lets you type into a script's stdin when it asks for input — prompts appear the moment they're printed
- Pause and resume freezes the actual process (same mechanism Process Explorer uses), no cooperation needed from the script
- Import via file picker or by dropping files onto the window
- Dark and light theme, frameless window anchored above the tray

The manager only stores the path to your script. It never copies, edits, or deletes the file itself.

## A few honest notes

- Scripts run with your user privileges, unsandboxed. The tool runs what you tell it to run — importing a script you don't trust is the same as double-clicking it.
- Script output can contain secrets (tokens, keys) if the script prints them. Output stays in memory on your machine, capped at 500 lines, and is never written to disk or sent anywhere.
- Pause is a hard freeze. A paused script doesn't know it's paused, so network connections may time out and timers shift once it resumes.
- Interpreters are resolved from your PATH: `python`, `powershell`, `node`, `bash` (Git Bash or WSL). If one is missing, the error shows up in the output pane.

## Quick start

You'll need [Rust](https://rustup.rs) and [Node.js](https://nodejs.org) installed.

```powershell
cd script-manager
npm install
npm run tauri dev
```

The app starts in the tray (bottom right, near the clock). Left-click the icon to open the window, right-click for the menu. Import a script, hit the play button, open the terminal pane from the bottom bar to watch it run.

To build a release executable:

```powershell
npm run tauri build
```

## Documentation

Full user and technical guides will live in `documentation/` as the project matures.

## Contributing

The project is open-source and early. Everything you need — setup, code rules, PR checklist, how to report bugs — is in [CONTRIBUTING.md](CONTRIBUTING.md).

Licensed under [MIT](LICENSE). Third-party attributions are in [NOTICE](NOTICE).
