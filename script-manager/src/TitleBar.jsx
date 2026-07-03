import { getCurrentWindow } from "@tauri-apps/api/window";
import { MoonIcon, SunIcon, XIcon } from "./Icons";
import "./TitleBar.css";

/** Custom title bar replacing the native frame: app title, theme toggle,
    and a close button that hides the window to the tray. */
function TitleBar({ theme, onToggleTheme }) {
  async function hideWindow() {
    await getCurrentWindow().hide();
  }

  return (
    <header className="title-bar">
      <span className="title-bar-label">Scripts Manager</span>

      <div className="title-bar-actions">
        <button
          className="title-bar-button"
          onClick={onToggleTheme}
          aria-label={
            theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
          }
          title={theme === "dark" ? "Light theme" : "Dark theme"}
        >
          {theme === "dark" ? <SunIcon size={15} /> : <MoonIcon size={15} />}
        </button>

        <button
          className="title-bar-button close"
          onClick={hideWindow}
          aria-label="Hide window"
          title="Hide to tray"
        >
          <XIcon size={15} />
        </button>
      </div>
    </header>
  );
}

export default TitleBar;
