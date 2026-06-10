:root {
  --bg: #050814;
  --glass-bg: rgba(180, 220, 255, 0.16);
  --glass-border: rgba(200, 230, 255, 0.45);
  --accent: #4fb4ff;
  --text-main: #f7fbff;
  --text-muted: #9fb3c9;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  background: radial-gradient(circle at top, #101b33 0, #050814 55%, #02040a 100%);
  color: var(--text-main);
}

.hidden { display: none; }

.glass-card,
.glass-bar {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(18px);
  border-radius: 18px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55);
}

.auth-card {
  max-width: 360px;
  margin: 80px auto;
  padding: 24px;
}

input,
button {
  font: inherit;
}

input {
  width: 100%;
  padding: 10px 12px;
  margin-bottom: 10px;
  border-radius: 10px;
  border: 1px solid rgba(200, 230, 255, 0.35);
  background: rgba(5, 8, 20, 0.8);
  color: var(--text-main);
}

button {
  cursor: pointer;
}

.btn-glass {
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--accent);
  background: radial-gradient(circle at top, rgba(79, 180, 255, 0.35), rgba(5, 8, 20, 0.9));
  color: var(--text-main);
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  margin: 10px;
}

.main-content {
  padding: 10px;
  padding-bottom: 70px;
}

.glass-grid {
  display: grid;
  gap: 12px;
}

.glass-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.panel {
  display: none;
}

.panel.active {
  display: block;
}

.bottom-nav {
  position: fixed;
  bottom: 10px;
  left: 10px;
  right: 10px;
  display: flex;
  justify-content: space-between;
  padding: 6px 8px;
}

.nav-btn {
  flex: 1;
  margin: 0 4px;
  padding: 8px 0;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--text-muted);
}

.nav-btn.active {
  background: rgba(79, 180, 255, 0.25);
  color: var(--text-main);
}

.status-pill {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: rgba(79, 180, 255, 0.25);
}

.modal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-content {
  padding: 16px;
  max-width: 420px;
  width: 90%;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

#signature-pad {
  width: 100%;
  height: 180px;
  background: rgba(5, 8, 20, 0.9);
  border-radius: 12px;
}

#toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(5, 8, 20, 0.95);
  border: 1px solid var(--accent);
  color: var(--text-main);
  font-size: 13px;
  display: none;
}

/* simple desktop tweaks */
@media (min-width: 900px) {
  .main-content {
    max-width: 900px;
    margin: 0 auto;
  }
  .bottom-nav {
    max-width: 420px;
    left: 50%;
    transform: translateX(-50%);
  }
}
