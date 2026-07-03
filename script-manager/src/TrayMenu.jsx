import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { StopIcon, TerminalIcon, XIcon } from "./Icons";
import { applyTheme, getStoredTheme } from "./theme";
import logo from "./assets/logo.png";
import "./TrayMenu.css";

/** Custom tray context menu rendered in its own popup window, styled like the main app. */
function TrayMenu() {
  const [runningCount, setRunningCount] = useState(0);

  useEffect(() => {
    const menuWindow = getCurrentWindow();

    invoke("get_running_scripts").then((entries) =>
      setRunningCount(entries.length)
    );

    // Refresh the running count and theme each time the menu is opened.
    const unlistenFocus = menuWindow.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        applyTheme(getStoredTheme());
        invoke("get_running_scripts").then((entries) =>
          setRunningCount(entries.length)
        );
      }
    });

    // Live-sync the theme when the main window changes it.
    function handleStorage(event) {
      if (event.key === "theme") {
        applyTheme(getStoredTheme());
      }
    }

    window.addEventListener("storage", handleStorage);

    return () => {
      unlistenFocus.then((stop) => stop());
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  /** Hides the menu popup, then runs the chosen action. */
  async function runAction(action) {
    await getCurrentWindow().hide();
    await action();
  }

  return (
    <div className="tray-menu">
      <div className="tray-menu-header">
        <span className="tray-menu-brand">
          <img
            className="tray-menu-logo"
            src={logo}
            alt=""
            aria-hidden="true"
          />
          <span className="tray-menu-title">Scripts Manager</span>
        </span>
        <span
          className={`tray-menu-status ${runningCount > 0 ? "active" : ""}`}
        >
          {runningCount} running
        </span>
      </div>

      <button
        className="tray-menu-item"
        onClick={() => runAction(() => invoke("toggle_main"))}
      >
        <TerminalIcon size={14} />
        Open Scripts Manager
      </button>

      <button
        className="tray-menu-item"
        disabled={runningCount === 0}
        onClick={() => runAction(() => invoke("stop_all_scripts"))}
      >
        <StopIcon size={14} />
        Stop all scripts
      </button>

      <div className="tray-menu-separator" />

      <button
        className="tray-menu-item danger"
        onClick={() => runAction(() => invoke("quit_app"))}
      >
        <XIcon size={14} />
        Quit
      </button>
    </div>
  );
}

export default TrayMenu;
