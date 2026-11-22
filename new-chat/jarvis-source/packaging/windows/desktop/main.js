"use strict";

/**
 * J.A.R.V.I.S. DESKTOP
 * Shell Electron natif : aucune barre d'adresse, une seule instance,
 * micro/caméra autorisés, liens externes dans le navigateur système.
 */

const { app, BrowserWindow, Menu, session, shell, dialog, protocol, net } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

// Le moteur reste un composant interne. L'interface, elle, vit sur un
// protocole applicatif natif : aucune URL localhost n'est exposee.
const ENGINE_URL = process.env.JARVIS_URL || "http://127.0.0.1:3210";
const APP_ORIGIN = "jarvis://app";
const APP_URL = `${APP_ORIGIN}/`;
const APP_ID = "ai.jarvis.complete";
let mainWindow = null;

// Doit etre appele AVANT app.ready. Chromium traite jarvis://app comme
// une origine standard, securisee et compatible fetch/micro/camera.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "jarvis",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  },
]);

app.setName("J.A.R.V.I.S.");
app.setAppUserModelId(APP_ID);
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("enable-features", "WebSpeechAPI");

// Données Electron avec les autres données Jarvis, hors Program Files.
const dataRoot = path.join(process.env.LOCALAPPDATA || app.getPath("appData"), "JarvisCompleteData", "desktop");
app.setPath("userData", dataRoot);

// Une seule fenêtre : un deuxième clic réaffiche la première.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

function boundsFile() {
  return path.join(dataRoot, "window-bounds.json");
}

function loadBounds() {
  try {
    const b = JSON.parse(fs.readFileSync(boundsFile(), "utf8"));
    if (b && b.width >= 900 && b.height >= 600) return b;
  } catch (_) {}
  return { width: 1440, height: 920 };
}

function saveBounds() {
  if (!mainWindow || mainWindow.isMaximized() || mainWindow.isMinimized()) return;
  try {
    fs.mkdirSync(dataRoot, { recursive: true });
    fs.writeFileSync(boundsFile(), JSON.stringify(mainWindow.getBounds()));
  } catch (_) {}
}

async function serverReady(maxMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    try {
      const response = await fetch(`${ENGINE_URL}/api/health`, { signal: AbortSignal.timeout(1500) });
      const json = await response.json();
      if (json && json.ok) return true;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function splashHtml() {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`
<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;background:#01040c;color:#cffafe;height:100vh;display:grid;place-items:center;font-family:Consolas,monospace;overflow:hidden}
main{text-align:center}.core{width:128px;height:128px;margin:auto;border-radius:50%;border:2px solid #22d3ee;box-shadow:0 0 30px #22d3ee88,inset 0 0 24px #22d3ee55;display:grid;place-items:center;animation:spin 5s linear infinite}.core:before{content:"";width:54px;height:54px;border-radius:50%;background:#ecfeff;box-shadow:0 0 35px 12px #22d3ee}.title{font-size:26px;letter-spacing:.4em;margin:35px 0 10px;text-shadow:0 0 18px #22d3ee}.sub{font-size:11px;letter-spacing:.25em;color:#22d3ee99}.dots:after{content:"";animation:dots 1.5s infinite}@keyframes spin{to{transform:rotate(360deg)}}@keyframes dots{0%{content:""}33%{content:"."}66%{content:".."}100%{content:"..."}}
</style></head><body><main><div class="core"></div><div class="title">J.A.R.V.I.S.</div><div class="sub dots">INITIALISATION DES SYSTÈMES</div></main></body></html>`)}`;
}

/**
 * Pont applicatif interne : jarvis://app/... -> moteur prive 127.0.0.1.
 * Pour Chromium et pour l'utilisateur, l'origine reste jarvis://app.
 */
async function handleJarvisProtocol(request) {
  try {
    const source = new URL(request.url);
    if (source.hostname !== "app") {
      return new Response("Origine Jarvis inconnue", { status: 404 });
    }

    const target = `${ENGINE_URL}${source.pathname}${source.search}`;
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("origin");
    headers.delete("referer");
    headers.delete("content-length");
    headers.set("x-jarvis-desktop", "1");

    const options = {
      method: request.method,
      headers,
      redirect: "follow",
      bypassCustomProtocolHandlers: true,
    };

    if (!['GET', 'HEAD'].includes(request.method)) {
      const bytes = await request.arrayBuffer();
      options.body = Buffer.from(bytes);
    }

    return await net.fetch(target, options);
  } catch (error) {
    return new Response(`Moteur Jarvis indisponible: ${error.message}`, {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

async function createWindow() {
  const bounds = loadBounds();
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 620,
    show: false,
    title: "J.A.R.V.I.S.",
    icon: path.join(__dirname, "jarvis.ico"),
    backgroundColor: "#01040c",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: true,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });
  mainWindow.on("resize", saveBounds);
  mainWindow.on("move", saveBounds);
  mainWindow.on("closed", () => { mainWindow = null; });

  // Permission locale uniquement : micro, caméra, notifications.
  const allowed = new Set(["media", "microphone", "camera", "notifications", "display-capture"]);
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const origin = details.requestingUrl || webContents.getURL();
    callback(origin.startsWith(APP_ORIGIN) && allowed.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    return requestingOrigin.startsWith(APP_ORIGIN) && allowed.has(permission);
  });

  // Les vrais sites externes s'ouvrent dans le navigateur par défaut.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_ORIGIN)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(APP_ORIGIN) && !url.startsWith("data:")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  await mainWindow.loadURL(splashHtml());
  const ready = await serverReady();
  if (!ready) {
    dialog.showErrorBox(
      "J.A.R.V.I.S. — serveur indisponible",
      `Le moteur local n'a pas démarré.\n\nConsultez :\n${path.join(process.env.LOCALAPPDATA || "", "JarvisCompleteData", "logs", "jarvis-server-error.log")}`
    );
    return;
  }

  await mainWindow.loadURL(`${APP_URL}?desktop=1`);
}

app.whenReady().then(async () => {
  protocol.handle("jarvis", handleJarvisProtocol);
  await createWindow();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("window-all-closed", () => app.quit());
