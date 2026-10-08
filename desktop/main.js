// Fairway Studio for Windows: a locked-down window around the live web app.
// The app itself is always the deployed site, so desktop users get updates without reinstalling.
const { app, BrowserWindow, shell, Menu, session } = require("electron");
const path = require("node:path");

// Tried in order; the first that loads wins. The vercel.app address is a fallback until the custom
// domain is connected (it may ask Vercel team members to sign in to Vercel first).
const APP_URLS = [
  "https://fairway.jlinfluence.com",
  "https://sports-brand-collaboration-setup.vercel.app",
];
// Sign-in and confirmation pages that may open inside the window; everything else goes to the browser.
const AUTH_HOSTS = [/\.supabase\.co$/i];

let mainWindow = null;
let connecting = false;
let appOrigin = new URL(APP_URLS[0]).origin;

function isAppUrl(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && (url.origin === appOrigin || AUTH_HOSTS.some((h) => h.test(url.hostname)));
  } catch { return false; }
}

function openExternally(raw) {
  try {
    const url = new URL(raw);
    if (["https:", "http:", "mailto:", "tel:"].includes(url.protocol)) void shell.openExternal(url.toString());
  } catch { /* ignore malformed links */ }
}

async function loadFirstReachable(win) {
  if (connecting) return;
  connecting = true;
  try {
    for (const candidate of APP_URLS) {
      try {
        await win.loadURL(candidate);
        appOrigin = new URL(candidate).origin;
        return;
      } catch { /* try the next address */ }
    }
    await win.loadFile(path.join(__dirname, "offline.html"));
  } finally { connecting = false; }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Fairway Studio",
    backgroundColor: "#f4f3ed",
    icon: path.join(__dirname, "build", "icon.png"),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Keep the window on the studio; send every other site to the user's browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) return { action: "allow" };
    openExternally(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file:") && url.endsWith("offline.html")) return;
    if (!isAppUrl(url)) { event.preventDefault(); openExternally(url); }
  });
  // If the connection drops mid-session, show the reconnect page instead of a blank window.
  mainWindow.webContents.on("did-fail-load", (_event, code, _desc, url, isMainFrame) => {
    if (isMainFrame && !connecting && code !== -3 && !url.startsWith("file:")) void mainWindow.loadFile(path.join(__dirname, "offline.html"));
  });

  void loadFirstReachable(mainWindow);
}

// The offline page's "Try again" button asks the main process to reconnect.
app.on("web-contents-created", (_event, contents) => {
  contents.on("ipc-message", (_e, channel) => {
    if (channel === "fairway:retry" && mainWindow) void loadFirstReachable(mainWindow);
  });
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(() => {
    // Only grant the permissions the studio actually uses (camera/microphone for media capture).
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
      callback(isAppUrl(contents.getURL()) && ["media", "clipboard-sanitized-write", "notifications", "fullscreen"].includes(permission));
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: "Fairway Studio", submenu: [{ role: "reload" }, { role: "forceReload" }, { type: "separator" }, { role: "quit" }] },
      { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
      { label: "View", submenu: [{ role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
    ]));
    createWindow();
  });
  app.on("window-all-closed", () => app.quit());
}
