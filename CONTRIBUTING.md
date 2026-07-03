# Contributing

Thanks for looking into contributing. This is a small project with a clear direction, so contributing is simple — there just are a few rules worth reading first.

## Ground rules

The project follows [CONVENTION.md](CONVENTION.md). It's short; read it before writing code. The parts that come up most in practice:

- Follow each language's native naming convention (snake_case in Rust and Python, camelCase in JavaScript).
- Write expanded, readable code. If a one-liner needs a second read to understand, it should be several lines.
- Docstrings on public functions: Rust doc comments (`///`), JSDoc (`/** ... */`) for exported JS. Say what the thing is *for*, not how it works.
- New dependencies need a reason. If the existing stack covers the need, use the existing stack. Every dependency added so far is listed in [NOTICE](NOTICE) with its justification.
- No secrets in the codebase — not in code, not in test files, not in examples. Example values must be obvious placeholders.

Architecture decisions and project direction are set by the author. If you want to build something structural (new window, new subsystem, a config format), open an issue and talk about it first — it saves you from writing code that doesn't get merged.

## Setting up

You need [Rust](https://rustup.rs), [Node.js](https://nodejs.org), and on Windows the WebView2 runtime (already present on Windows 10/11).

```powershell
cd script-manager
npm install
npm run tauri dev
```

Frontend changes hot-reload. Rust changes trigger a recompile, which takes a few seconds.

## Where things live

- `script-manager/src/` — React frontend (script list, terminal pane, tray menu popup, theming)
- `script-manager/src-tauri/src/` — Rust backend:
  - `lib.rs` — app setup, tray icon, window management
  - `scripts.rs` — the script registry (add/remove/persist)
  - `runner.rs` — process spawning, output streaming, pause/resume, stdin
- Root `.md` files — project information, one fact per file; don't duplicate content between them

## Before opening a PR

1. `cargo check` passes in `src-tauri/` with no warnings.
2. `npm run build` passes in `script-manager/`.
3. You actually ran the app and exercised what you changed. For anything touching the runner, that means: start a script, watch output stream, stop it, and check the exit line appears in the terminal pane.
4. The change stays in scope — one PR does one thing.

Keep commit messages plain: what changed and why, present tense.

## Reporting bugs

Open an issue with three things: what you ran, what you expected, and what happened instead. If a script is involved, a minimal version of it helps a lot — "a Python script that prints every second" beats "my script".

## Security

If you find a vulnerability, don't open a public issue. Contact the author directly. Note that some behaviors are stated design decisions rather than bugs: scripts run unsandboxed with the user's own privileges, pause is a hard process freeze, and there is no remote/network access in this version.
