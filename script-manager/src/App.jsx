import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, open } from "@tauri-apps/plugin-dialog";
import TitleBar from "./TitleBar";
import {
  FileCodeIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  StopIcon,
  TerminalIcon,
  TrashIcon,
} from "./Icons";
import { getStoredTheme, storeTheme } from "./theme";
import "./App.css";

/** Cap on how many terminal lines are kept in memory. */
const MAX_LOG_LINES = 500;

/** Appends a raw output chunk to the line list. Chunks are not line-aligned:
    a line without a trailing newline stays "open" (a pending prompt) and is
    completed by the next chunk — or by the user's own input echo. */
function appendChunk(lines, id, stream, chunk) {
  const next = [...lines];
  const segments = chunk.split("\n");
  const endsWithNewline = segments[segments.length - 1] === "";

  if (endsWithNewline) {
    segments.pop();
  }

  if (segments.length === 0) {
    // The chunk was just a newline: close the pending line if any.
    const last = next[next.length - 1];

    if (last && last.open && last.id === id) {
      next[next.length - 1] = { ...last, open: false };
    }

    return next;
  }

  segments.forEach((rawSegment, index) => {
    const segment = rawSegment.endsWith("\r")
      ? rawSegment.slice(0, -1)
      : rawSegment;
    const isLastSegment = index === segments.length - 1;
    const open = isLastSegment && !endsWithNewline;
    const last = next[next.length - 1];

    if (index === 0 && last && last.open && last.id === id) {
      // Continue the pending line (e.g. prompt + the user's reply).
      next[next.length - 1] = { ...last, line: last.line + segment, open };
    } else {
      next.push({ id, stream, line: segment, open });
    }
  });

  return next.slice(-MAX_LOG_LINES);
}

/** Root view: script list with run/pause/stop controls and a toggleable output terminal. */
function App() {
  const [scripts, setScripts] = useState([]);
  const [runningIds, setRunningIds] = useState([]);
  const [pausedIds, setPausedIds] = useState([]);
  const [logLines, setLogLines] = useState([]);
  const [showTerminal, setShowTerminal] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [theme, setTheme] = useState(getStoredTheme);
  const [error, setError] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [inputText, setInputText] = useState("");
  const terminalRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    /** Pulls the registry and running state from the backend. Runs on mount
        and again whenever the window is shown, so a call that failed while
        the app was still starting up cannot leave the list empty. */
    async function refreshState() {
      try {
        setScripts(await invoke("get_scripts"));

        const entries = await invoke("get_running_scripts");

        setRunningIds(entries.map((entry) => entry.id));
        setPausedIds(
          entries.filter((entry) => entry.paused).map((entry) => entry.id)
        );
      } catch (message) {
        setError(`Could not load your scripts: ${message}`);
      }
    }

    refreshState();

    const unlistenShown = listen("main-shown", refreshState);

    const unlistenFocus = getCurrentWindow().onFocusChanged(
      ({ payload: focused }) => {
        if (focused) {
          refreshState();
        }
      }
    );

    const unlistenOutput = listen("script-output", (event) => {
      const { id, stream, chunk } = event.payload;

      setLogLines((lines) => appendChunk(lines, id, stream, chunk));
    });

    const unlistenExited = listen("script-exited", (event) => {
      const { id, code } = event.payload;

      setRunningIds((ids) => ids.filter((runningId) => runningId !== id));
      setPausedIds((ids) => ids.filter((pausedId) => pausedId !== id));
      setLogLines((lines) =>
        [
          ...lines,
          {
            id,
            stream: "info",
            line: `[exited with code ${code ?? "unknown"}]`,
            open: false,
          },
        ].slice(-MAX_LOG_LINES)
      );
    });

    // Native file drag-and-drop from the OS (the webview cannot read real
    // paths from HTML5 drop events, so this goes through Tauri's events).
    // Listened globally rather than via onDragDropEvent, whose per-webview
    // target scoping can miss the events on Windows.
    const unlistenDragEnter = listen("tauri://drag-enter", () => {
      setIsDragging(true);
    });

    const unlistenDragLeave = listen("tauri://drag-leave", () => {
      setIsDragging(false);
    });

    const unlistenDragDrop = listen("tauri://drag-drop", (event) => {
      setIsDragging(false);
      addScriptPaths(event.payload.paths);
    });

    return () => {
      unlistenShown.then((unlisten) => unlisten());
      unlistenFocus.then((unlisten) => unlisten());
      unlistenOutput.then((unlisten) => unlisten());
      unlistenExited.then((unlisten) => unlisten());
      unlistenDragEnter.then((unlisten) => unlisten());
      unlistenDragLeave.then((unlisten) => unlisten());
      unlistenDragDrop.then((unlisten) => unlisten());
    };
  }, []);

  // The custom context menu replaces the webview's default one and closes
  // on any click, Escape, or a right-click elsewhere.
  useEffect(() => {
    function handleWindowContextMenu(event) {
      event.preventDefault();
      setContextMenu(null);
    }

    function handleClick() {
      setContextMenu(null);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    }

    window.addEventListener("contextmenu", handleWindowContextMenu);
    window.addEventListener("click", handleClick);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("contextmenu", handleWindowContextMenu);
      window.removeEventListener("click", handleClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;

    if (terminal) {
      terminal.scrollTop = terminal.scrollHeight;
    }
  }, [logLines, showTerminal]);

  /** Switches between the dark and light theme and persists the choice. */
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";

    storeTheme(next);
    setTheme(next);
  }

  /** Registers one or more scripts by path, accumulating any errors. */
  async function addScriptPaths(paths) {
    setError("");

    const errors = [];

    for (const path of paths) {
      try {
        setScripts(await invoke("add_script", { path }));
      } catch (message) {
        errors.push(String(message));
      }
    }

    if (errors.length > 0) {
      setError(errors.join(" "));
    }
  }

  /** Opens a native file picker and registers the selected Python script. */
  async function importScript() {
    const selected = await open({
      title: "Select a script",
      filters: [
        {
          name: "Scripts",
          extensions: ["py", "ps1", "bat", "cmd", "js", "sh", "exe"],
        },
      ],
    });

    if (selected) {
      await addScriptPaths([selected]);
    }
  }

  /** Removes a script from the registry, asking for confirmation first
      when it is still running (removal kills the process). */
  async function removeScript(id) {
    setError("");

    if (runningIds.includes(id)) {
      const confirmed = await ask(
        `${scriptName(id)} is still running. Removing it will stop the script. Continue?`,
        { title: "Remove running script", kind: "warning" }
      );

      if (!confirmed) {
        return;
      }
    }

    try {
      setScripts(await invoke("remove_script", { id }));
      setSelectedId((current) => (current === id ? null : current));
    } catch (message) {
      setError(String(message));
    }
  }

  /** Starts a script and marks it as running. */
  async function startScript(id) {
    setError("");

    try {
      await invoke("start_script", { id });
      setRunningIds((ids) => [...ids, id]);
    } catch (message) {
      setError(String(message));
    }
  }

  /** Stops a running script; the exit event updates the running state. */
  async function stopScript(id) {
    setError("");

    try {
      await invoke("stop_script", { id });
    } catch (message) {
      setError(String(message));
    }
  }

  /** Freezes a running script's process. */
  async function pauseScript(id) {
    setError("");

    try {
      await invoke("pause_script", { id });
      setPausedIds((ids) => [...ids, id]);
    } catch (message) {
      setError(String(message));
    }
  }

  /** Unfreezes a paused script's process. */
  async function resumeScript(id) {
    setError("");

    try {
      await invoke("resume_script", { id });
      setPausedIds((ids) => ids.filter((pausedId) => pausedId !== id));
    } catch (message) {
      setError(String(message));
    }
  }

  /** Sends the typed line to the selected running script's stdin. */
  async function sendInput() {
    if (!selectedId || !inputText) {
      return;
    }

    setError("");

    try {
      await invoke("send_input", { id: selectedId, text: inputText });
      setInputText("");
    } catch (message) {
      setError(String(message));
    }
  }

  /** Resolves a script id to its display name for terminal prefixes. */
  function scriptName(id) {
    const script = scripts.find((entry) => entry.id === id);
    return script ? script.name : id;
  }

  /** Selects a script to filter the terminal on, or deselects it to show all output. */
  function toggleSelection(id) {
    setSelectedId((current) => (current === id ? null : id));
  }

  /** Wraps a row-action handler so it does not change the selection. */
  function rowAction(handler, id) {
    return (event) => {
      event.stopPropagation();
      handler(id);
    };
  }

  const visibleLines = selectedId
    ? logLines.filter((entry) => entry.id === selectedId)
    : logLines;

  const lastVisible = visibleLines[visibleLines.length - 1];
  const hasPendingPrompt = Boolean(lastVisible && lastVisible.open);

  // A pending prompt on the selected running script focuses the input, so
  // answering an input() request is just: see it appear, type, Enter.
  useEffect(() => {
    if (
      hasPendingPrompt &&
      showTerminal &&
      selectedId &&
      runningIds.includes(selectedId)
    ) {
      inputRef.current?.focus();
    }
  }, [hasPendingPrompt, showTerminal, selectedId, runningIds]);

  return (
    <div className="app">
      <TitleBar theme={theme} onToggleTheme={toggleTheme} />

      <div className="body">
        <main className="content">
          <div className="toolbar">
            <h2 className="toolbar-title">
              Scripts
              <span className="toolbar-count">{scripts.length}</span>
            </h2>
            <button className="import-button" onClick={importScript}>
              <PlusIcon size={14} />
              Import
            </button>
          </div>

          {error && <p className="error-message">{error}</p>}

          {scripts.length === 0 ? (
            <div className="empty-state">
              <FileCodeIcon size={36} />
              <p>No scripts yet.</p>
              <p className="empty-state-hint">
                Import a script to get started.
              </p>
            </div>
          ) : (
            <ul className="script-list">
              {scripts.map((script) => {
                const isRunning = runningIds.includes(script.id);
                const isPaused = pausedIds.includes(script.id);
                const isSelected = selectedId === script.id;

                const statusClass = isPaused
                  ? "paused"
                  : isRunning
                    ? "running"
                    : "";
                const statusTitle = isPaused
                  ? "Paused"
                  : isRunning
                    ? "Running"
                    : "Stopped";

                return (
                  <li
                    key={script.id}
                    className={`script-item ${isSelected ? "selected" : ""}`}
                    onClick={() => toggleSelection(script.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setContextMenu({
                        x: Math.min(event.clientX, window.innerWidth - 170),
                        y: Math.min(event.clientY, window.innerHeight - 190),
                        id: script.id,
                      });
                    }}
                  >
                    <span
                      className={`status-dot ${statusClass}`}
                      title={statusTitle}
                    />
                    <div className="script-info">
                      <span className="script-name">{script.name}</span>
                      <span className="script-path">{script.path}</span>
                    </div>
                    <div className="script-actions">
                      {isRunning && !isPaused && (
                        <button
                          className="icon-button pause"
                          onClick={rowAction(pauseScript, script.id)}
                          aria-label={`Pause ${script.name}`}
                          title="Pause"
                        >
                          <PauseIcon size={14} />
                        </button>
                      )}
                      {isRunning && isPaused && (
                        <button
                          className="icon-button pause"
                          onClick={rowAction(resumeScript, script.id)}
                          aria-label={`Resume ${script.name}`}
                          title="Resume"
                        >
                          <PlayIcon size={14} />
                        </button>
                      )}
                      {isRunning ? (
                        <button
                          className="icon-button stop"
                          onClick={rowAction(stopScript, script.id)}
                          aria-label={`Stop ${script.name}`}
                          title="Stop"
                        >
                          <StopIcon size={14} />
                        </button>
                      ) : (
                        <button
                          className="icon-button run"
                          onClick={rowAction(startScript, script.id)}
                          aria-label={`Run ${script.name}`}
                          title="Run"
                        >
                          <PlayIcon size={14} />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </main>

        {showTerminal && (
          <aside className="terminal">
            <div className="terminal-header">
              <span className="terminal-header-title">
                <TerminalIcon size={13} />
                {selectedId ? scriptName(selectedId) : "All scripts"}
              </span>
              <button
                className="terminal-clear"
                onClick={() => setLogLines([])}
                aria-label="Clear output"
                title="Clear output"
              >
                <TrashIcon size={13} />
              </button>
            </div>
            <div className="terminal-lines" ref={terminalRef}>
              {visibleLines.length === 0 ? (
                <span className="terminal-line info">
                  {selectedId
                    ? `No output from ${scriptName(selectedId)} yet.`
                    : "No output yet."}
                </span>
              ) : (
                visibleLines.map((entry, index) => {
                  const text =
                    entry.stream === "stdin" ? `› ${entry.line}` : entry.line;

                  return (
                    <span
                      key={index}
                      className={`terminal-line ${entry.stream}`}
                    >
                      {selectedId
                        ? text
                        : `[${scriptName(entry.id)}] ${text}`}
                    </span>
                  );
                })
              )}
            </div>
            <div className="terminal-input-row">
              <span className="terminal-input-prompt">›</span>
              <input
                ref={inputRef}
                className="terminal-input"
                type="text"
                value={inputText}
                disabled={!selectedId || !runningIds.includes(selectedId)}
                placeholder={
                  !selectedId
                    ? "Select a script to send input"
                    : !runningIds.includes(selectedId)
                      ? `${scriptName(selectedId)} is not running`
                      : `Send input to ${scriptName(selectedId)}`
                }
                aria-label="Script input"
                onChange={(event) => setInputText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    sendInput();
                  }
                }}
              />
            </div>
          </aside>
        )}
      </div>

      <footer className="bottom-bar">
        <button
          className={`terminal-toggle ${showTerminal ? "active" : ""}`}
          onClick={() => setShowTerminal((shown) => !shown)}
          aria-label={showTerminal ? "Hide terminal" : "Show terminal"}
        >
          <TerminalIcon size={13} />
          Terminal
        </button>

        <span className="status-summary">
          {scripts.length} script{scripts.length === 1 ? "" : "s"} ·{" "}
          {runningIds.length} running
        </span>
      </footer>

      {contextMenu &&
        (() => {
          const isRunning = runningIds.includes(contextMenu.id);
          const isPaused = pausedIds.includes(contextMenu.id);

          /** Closes the menu, then runs the chosen action. */
          function menuAction(handler) {
            return () => {
              setContextMenu(null);
              handler(contextMenu.id);
            };
          }

          return (
            <div
              className="context-menu"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              {!isRunning && (
                <button
                  className="context-menu-item"
                  onClick={menuAction(startScript)}
                >
                  <PlayIcon size={13} />
                  Run
                </button>
              )}
              {isRunning && !isPaused && (
                <button
                  className="context-menu-item"
                  onClick={menuAction(pauseScript)}
                >
                  <PauseIcon size={13} />
                  Pause
                </button>
              )}
              {isRunning && isPaused && (
                <button
                  className="context-menu-item"
                  onClick={menuAction(resumeScript)}
                >
                  <PlayIcon size={13} />
                  Resume
                </button>
              )}
              {isRunning && (
                <button
                  className="context-menu-item"
                  onClick={menuAction(stopScript)}
                >
                  <StopIcon size={13} />
                  Stop
                </button>
              )}
              <div className="context-menu-separator" />
              <button
                className="context-menu-item danger"
                onClick={menuAction(removeScript)}
              >
                <TrashIcon size={13} />
                Remove
              </button>
            </div>
          );
        })()}

      {isDragging && (
        <div className="drop-overlay">
          <PlusIcon size={30} />
          <span>Drop scripts to import</span>
        </div>
      )}
    </div>
  );
}

export default App;
