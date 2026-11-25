#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════════════════
 J.A.R.V.I.S. — AGENT PC  (v1.0)

  Agent local open source (architecture façon Open Interpreter / PyAutoGUI).
  Il s'exécute EN ARRIÈRE-PLAN sur votre PC, se connecte au cerveau Jarvis
  (interface web), et exécute ses ordres :

    • Souris      : déplacer, centrer, cliquer, double-cliquer, clic droit
    • Clavier     : taper du texte
    • Console     : exécuter n'importe quelle commande shell du PC
    • Fichiers    : ouvrir applications, dossiers (documents, bureau…)
    • Écran       : captures d'écran renvoyées à Jarvis
    • Système     : verrouillage, extinction/redémarrage (annulables)

  Installation :
      pip install pyautogui requests pillow ddgs
      python jarvis-agent.py --server https://VOTRE-JARVIS

  Options :
      --server URL      URL du cerveau Jarvis (obligatoire au 1er lancement)
      --name NOM        Nom affiché de ce PC
      --autostart       Installe l'agent au démarrage de la session
      --unsafe          Désactive le garde-fou sur les commandes dangereuses
      --daemon          Mode silencieux (aucune fenêtre de log)
═══════════════════════════════════════════════════════════════════════════════
"""

import argparse
import base64
import io
import json
import os
import platform
import subprocess
import sys
import threading
import time

import requests

# ── Windows : aucun processus enfant en fenêtre visible ─────────────────────
# pythonw.exe n'a pas de console ; chaque enfant console (powershell, taskkill,
# clip, explorer…) ouvrirait alors une fenêtre sur le bureau à chaque appel.
# On impose CREATE_NO_WINDOW à tous les Popen de ce module.
if os.name == "nt":
    _CREATE_NO_WINDOW = 0x08000000
    _PopenBase = subprocess.Popen

    class _QuietPopen(_PopenBase):
        def __init__(self, *args, **kwargs):
            kwargs.setdefault("creationflags", _CREATE_NO_WINDOW)
            super().__init__(*args, **kwargs)

    subprocess.Popen = _QuietPopen  # type: ignore[assignment]

try:
    import pyautogui
    pyautogui.FAILSAFE = True          # souris dans le coin haut-gauche = arrêt d'urgence
    pyautogui.PAUSE = 0.05
    HAS_GUI = True
except Exception:
    HAS_GUI = False

try:
    from PIL import Image
    HAS_PIL = True
except Exception:
    HAS_PIL = False

CONFIG_PATH = os.path.join(os.path.expanduser("~"), ".jarvis-agent.json")
POLL_SECONDS = 2.0

# Garde-fou par défaut (désactivé avec --unsafe)
BLOCKLIST = ["mkfs", "format c:", "format d:", "rm -rf /", "rm -rf ~",
             "del /f /s /q c:\\", "shutdown now", "dd if=", ":(){"]

# ──────────────────────────────── CONFIG ────────────────────────────────────

def load_config():
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def save_config(cfg):
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
    except Exception:
        pass

def log(msg):
    if not ARGS.daemon:
        print(f"[jarvis] {msg}", flush=True)

# ──────────────────────────────── EXÉCUTEURS ────────────────────────────────

import glob

def run_shell(command, timeout=30):
    if not ARGS.unsafe:
        low = command.lower()
        for banned in BLOCKLIST:
            if banned in low:
                return False, f"Commande bloquée par le garde-fou : « {command} ». Relancez l'agent avec --unsafe pour forcer."
    try:
        proc = subprocess.run(command, shell=True, capture_output=True,
                              text=True, timeout=timeout, errors="replace")
        out = (proc.stdout or "") + (proc.stderr or "")
        return proc.returncode == 0, out.strip()[:6000] or "(aucune sortie)"
    except subprocess.TimeoutExpired:
        return False, "Délai dépassé (30 s)."
    except Exception as e:
        return False, str(e)

APP_ALIASES = {
    # nom parle -> (executable Windows, nom affiche)
    "word": ("winword.exe", "Microsoft Word"),
    "winword": ("winword.exe", "Microsoft Word"),
    "excel": ("excel.exe", "Microsoft Excel"),
    "powerpoint": ("powerpnt.exe", "Microsoft PowerPoint"),
    "outlook": ("outlook.exe", "Microsoft Outlook"),
    "onenote": ("onenote.exe", "Microsoft OneNote"),
    "access": ("msaccess.exe", "Microsoft Access"),
    "chrome": ("chrome.exe", "Google Chrome"),
    "firefox": ("firefox.exe", "Mozilla Firefox"),
    "edge": ("msedge.exe", "Microsoft Edge"),
    "vscode": ("code.exe", "Visual Studio Code"),
    "code": ("code.exe", "Visual Studio Code"),
    "spotify": ("spotify.exe", "Spotify"),
    "discord": ("discord.exe", "Discord"),
    "steam": ("steam.exe", "Steam"),
    "vlc": ("vlc.exe", "VLC"),
    "paint": ("mspaint.exe", "Paint"),
    "notepad": ("notepad.exe", "Bloc-notes"),
    "wordpad": ("write.exe", "WordPad"),
    "calc": ("calc.exe", "Calculatrice"),
    "explorer": ("explorer.exe", "Explorateur"),
    "taskmgr": ("taskmgr.exe", "Gestionnaire des taches"),
    "cmd": ("cmd.exe", "Invite de commandes"),
    "terminal": ("wt.exe", "Terminal Windows"),
    "powershell": ("powershell.exe", "PowerShell"),
    "control": ("control.exe", "Panneau de configuration"),
    "telegram": ("Telegram.exe", "Telegram"),
    "whatsapp": ("WhatsApp.exe", "WhatsApp"),
    "obsidian": ("Obsidian.exe", "Obsidian"),
    "notepad++": ("notepad++.exe", "Notepad++"),
    "notepad plus plus": ("notepad++.exe", "Notepad++"),
    "onedrive": ("OneDrive.exe", "OneDrive"),
    "teams": ("ms-teams.exe", "Microsoft Teams"),
    "code": ("Code.exe", "Visual Studio Code"),
}

OFFICE_DIRS = [
    r"C:\Program Files\Microsoft Office\root\Office16",
    r"C:\Program Files (x86)\Microsoft Office\root\Office16",
    r"C:\Program Files\Microsoft Office\Office16",
    r"C:\Program Files (x86)\Microsoft Office\Office16",
    r"C:\Program Files\Microsoft Office\root\Office15",
]


def resolve_windows_app(exe):
    """Trouve le chemin reel d'un .exe : PATH, App Paths du registre, Office."""
    import shutil
    found = shutil.which(exe)
    if found:
        return found
    try:
        import winreg
        for hive in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
            try:
                key = winreg.OpenKey(
                    hive, "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\" + exe)
                path, _ = winreg.QueryValueEx(key, "")
                winreg.CloseKey(key)
                if path and os.path.exists(path.strip('"')):
                    return path.strip('"')
            except OSError:
                continue
    except Exception:
        pass
    for d in OFFICE_DIRS:
        cand = os.path.join(d, exe)
        if os.path.exists(cand):
            return cand
    for base in (os.environ.get("ProgramFiles", ""), os.environ.get("ProgramFiles(x86)", ""),
                 os.environ.get("LOCALAPPDATA", "")):
        if not base:
            continue
        for root, dirs, files in os.walk(base):
            if root.count(os.sep) - base.count(os.sep) > 3:
                dirs[:] = []
                continue
            if exe.lower() in (f.lower() for f in files):
                return os.path.join(root, exe)
    return None


def find_start_menu_shortcut(name):
    """Trouve un raccourci .lnk par nom d'affichage dans les menus Demarrer."""
    import unicodedata
    def norm(v):
        v = unicodedata.normalize("NFD", str(v).lower())
        return "".join(c for c in v if unicodedata.category(c) != "Mn")
    wanted = norm(name).replace("microsoft ", "").strip()
    roots = [
        os.path.join(os.environ.get("ProgramData", ""),
                     "Microsoft", "Windows", "Start Menu", "Programs"),
        os.path.join(os.environ.get("APPDATA", ""),
                     "Microsoft", "Windows", "Start Menu", "Programs"),
    ]
    candidates = []
    for root in roots:
        if not root or not os.path.isdir(root):
            continue
        for dirpath, _dirs, files in os.walk(root):
            for filename in files:
                if not filename.lower().endswith(".lnk"):
                    continue
                label = norm(os.path.splitext(filename)[0]).replace("microsoft ", "")
                if wanted == label:
                    return os.path.join(dirpath, filename)
                if wanted in label or label in wanted:
                    candidates.append((abs(len(label) - len(wanted)), os.path.join(dirpath, filename)))
    return sorted(candidates)[0][1] if candidates else None


def launch_store_or_start_app(name):
    """Lance une app UWP/Store via Get-StartApps, ou un raccourci Start Menu."""
    shortcut = find_start_menu_shortcut(name)
    if shortcut:
        os.startfile(shortcut)  # type: ignore[attr-defined]
        return True, f"{name} lance depuis le menu Demarrer."
    try:
        safe = str(name).replace("'", "''")
        ps = (f"$a=Get-StartApps | Where-Object {{$_.Name -like '*{safe}*'}} | "
              "Select-Object -First 1; if($a){$a.AppID}")
        result = subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                                capture_output=True, text=True, timeout=15)
        appid = result.stdout.strip()
        if appid:
            subprocess.Popen(["explorer.exe", "shell:AppsFolder" + chr(92) + appid])
            return True, f"{name} lance depuis les applications Windows."
    except Exception:
        pass
    return False, f"Le logiciel {name} est introuvable dans Windows."


def launch_windows_app(name, args=None):
    """Lance n'importe quelle application Windows : alias, executable,
    registre App Paths, menu Demarrer, application Store, puis recherche."""
    key = str(name).lower().strip()
    exe, label = APP_ALIASES.get(
        key,
        (key if key.endswith(".exe") else key + ".exe", str(name))
    )
    path = resolve_windows_app(exe)
    if path:
        try:
            subprocess.Popen([path] + (args or []), close_fds=True)
            return True, f"{label} lance."
        except Exception as e:
            return False, f"Impossible de lancer {label} : {e}"

    # Le nom visible peut ne rien avoir en commun avec son .exe : la source
    # de verite devient alors le menu Demarrer / Get-StartApps.
    return launch_store_or_start_app(label if key in APP_ALIASES else name)


def open_target(job):
    system = platform.system()
    folder = job.get("folder")
    app = job.get("app")
    target = job.get("target")

    known_apps = {
        "windows": {"explorer": "explorer", "taskmgr": "taskmgr", "notepad": "notepad",
                    "calc": "calc", "cmd": "cmd", "terminal": "cmd", "powershell": "powershell",
                    "control": "control"},
        "linux":   {"explorer": "xdg-open ~", "notepad": "gedit", "calc": "gnome-calculator",
                    "cmd": "x-terminal-emulator", "terminal": "x-terminal-emulator",
                    "taskmgr": "gnome-system-monitor", "powershell": "pwsh", "control": "gnome-control-center"},
        "darwin":  {"explorer": "open ~", "notepad": "open -a TextEdit", "calc": "open -a Calculator",
                    "cmd": "open -a Terminal", "terminal": "open -a Terminal",
                    "taskmgr": "open -a 'Activity Monitor'", "powershell": "pwsh", "control": "open -a 'System Settings'"},
    }
    folders = {
        "documents": "~/Documents", "downloads": "~/Downloads", "desktop": "~/Desktop",
        "pictures": "~/Pictures", "music": "~/Music", "videos": "~/Videos",
    }

    def shell_open(cmd):
        if system == "Windows":
            subprocess.Popen(cmd, shell=True)
        else:
            subprocess.Popen(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        if folder:
            path = os.path.expanduser(folders.get(folder, "~/"))
            if system == "Windows":
                os.startfile(path)  # type: ignore[attr-defined]
            else:
                shell_open(f"xdg-open '{path}'" if system == "Linux" else f"open '{path}'")
            return True, f"Dossier {folder} ouvert."
        if app:
            if system == "Windows":
                return launch_windows_app(app)
            cmd = known_apps.get(system.lower(), known_apps["linux"]).get(app, app)
            shell_open(cmd)
            return True, f"{app} lance."
        if target:
            # Fichier / dossier existant → ouverture native
            expanded = os.path.expanduser(target)
            if os.path.exists(expanded):
                if system == "Windows":
                    os.startfile(expanded)  # type: ignore[attr-defined]
                else:
                    shell_open(f"xdg-open '{expanded}'" if system == "Linux" else f"open '{expanded}'")
                return True, f"{target} ouvert."
            # Recherche dans les dossiers personnels (nom partiel)
            for base in folders.values():
                found = glob.glob(os.path.join(os.path.expanduser(base), "**", f"*{target}*"), recursive=True)
                if found:
                    hit = found[0]
                    if system == "Windows":
                        os.startfile(hit)  # type: ignore[attr-defined]
                    else:
                        shell_open(f"xdg-open '{hit}'" if system == "Linux" else f"open '{hit}'")
                    return True, f"{os.path.basename(hit)} ouvert (trouvé dans {base})."
            # Application par son nom
            shell_open(target)
            return True, f"{target} lancé."
        return False, "Cible vide."
    except Exception as e:
        return False, f"Impossible d'ouvrir : {e}"

def screenshot_b64():
    if not HAS_GUI:
        return None, "pyautogui indisponible."
    try:
        shot = pyautogui.screenshot()
        if HAS_PIL:
            buf = io.BytesIO()
            shot.convert("RGB").save(buf, format="JPEG", quality=62)
            return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode(), None
        shot.save("/tmp/jarvis-shot.png")
        return None, "Capture enregistrée dans /tmp/jarvis-shot.png (PIL manquant pour l'envoi)."
    except Exception as e:
        return None, str(e)

def web_search(query, limit=10):
    """🌐 Métarecherche depuis la connexion résidentielle de l'utilisateur.

    DDGS agrège Google, Bing, Brave, Mojeek, Yahoo, Yandex et Wikipédia.
    Le scraper léger reste disponible si DDGS n'est pas installé.
    """
    import urllib.parse
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                             "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
               "Accept-Language": "fr-FR,fr;q=0.9"}
    import re as _re
    out = []

    # 1. DDGS : métamoteur open source multi-backends
    try:
        from ddgs import DDGS
        rows = DDGS(timeout=15).text(
            query,
            region="fr-fr",
            safesearch="moderate",
            max_results=max(limit, 10),
            backend="auto",
        )
        for x in rows:
            url = x.get("href") or x.get("url") or ""
            if not url:
                continue
            out.append({
                "title": str(x.get("title") or "")[:160],
                "url": str(url),
                "snippet": str(x.get("body") or x.get("snippet") or "")[:500],
                "provider": "DDGS",
            })
        if out:
            return True, json.dumps(out[:limit], ensure_ascii=False)
    except ImportError:
        log("DDGS absent — installez-le avec: pip install ddgs")
    except Exception as e:
        log(f"DDGS indisponible ({str(e)[:80]}) — repli léger")

    # 2. DuckDuckGo Lite direct
    try:
        r = requests.post("https://lite.duckduckgo.com/lite/", 
                          data={"q": query}, headers=headers, timeout=20)
        html_txt = r.text
        blocks = _re.findall(
            r'<a[^>]+class="result-link"[^>]+href="([^"]+)"[^>]*>(.*?)</a>.*?'
            r'class="result-snippet">(.*?)</td>', html_txt, _re.S)
        for url, title, snip in blocks[:limit]:
            strip = lambda s: _re.sub(r"\s+", " ", _re.sub(r"<[^>]+>", "", s)).strip()
            if "uddg=" in url:
                try:
                    url = urllib.parse.unquote(url.split("uddg=")[1].split("&")[0])
                except Exception:
                    pass
            out.append({"title": strip(title)[:110], "url": url, "snippet": strip(snip)[:300]})
    except Exception:
        pass
    if not out:
        try:
            r = requests.get("https://www.bing.com/search",
                             params={"q": query, "setlang": "fr"}, headers=headers, timeout=20)
            for m in _re.finditer(r'<li class="b_algo".*?<h2[^>]*>\s*<a[^>]+href="(http[^"]+)"[^>]*>(.*?)</a>.*?'
                                  r'(?:<p[^>]*>(.*?)</p>)?', r.text, _re.S):
                strip = lambda s: _re.sub(r"\s+", " ", _re.sub(r"<[^>]+>", "", s or "")).strip()
                out.append({"title": strip(m.group(2))[:110], "url": m.group(1),
                            "snippet": strip(m.group(3))[:300]})
                if len(out) >= limit:
                    break
        except Exception:
            pass
    return (len(out) > 0), json.dumps(out, ensure_ascii=False)


def fetch_url(url):
    """📄 Ouvre une page web depuis le PC et renvoie son texte lisible."""
    import re as _re
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                             "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
               "Accept-Language": "fr-FR,fr;q=0.9"}
    try:
        r = requests.get(url, headers=headers, timeout=25)
        h = r.text
        h = _re.sub(r"<(script|style|nav|footer|header|aside|noscript|svg|form)[^>]*>.*?</\1>", " ", h, flags=_re.S | _re.I)
        h = _re.sub(r"<br\s*/?>", "\n", h, flags=_re.I)
        h = _re.sub(r"</(p|div|li|h[1-6]|tr)>", "\n", h, flags=_re.I)
        txt = _re.sub(r"<[^>]+>", " ", h)
        for a, b in [("&nbsp;", " "), ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
                     ("&#39;", "'"), ("&quot;", '"')]:
            txt = txt.replace(a, b)
        txt = _re.sub(r"[ \t]{2,}", " ", txt)
        txt = _re.sub(r"\n{2,}", "\n", txt).strip()
        return True, txt[:8000]
    except Exception as e:
        return False, f"Lecture impossible : {e}"



# ============ MACROS : sequences clavier/souris pilotees ============

def _pg():
    import pyautogui
    pyautogui.FAILSAFE = True
    return pyautogui


def run_macro(steps):
    """Execute une sequence d'actions. Chaque etape est un dict :
      {"do":"launch","app":"word"}            lance une application
      {"do":"wait","seconds":3}               attente
      {"do":"type","text":"Bonjour"}          saisie clavier (accents inclus)
      {"do":"key","keys":["ctrl","s"]}        raccourci clavier
      {"do":"press","key":"enter"}            touche simple
      {"do":"open","path":"C:/.../f.docx"}    ouvre un fichier
      {"do":"close_window"}                   alt+F4
    """
    log_lines = []
    for i, step in enumerate(steps, 1):
        action = (step.get("do") or "").lower()
        try:
            if action == "launch":
                ok, msg = (launch_windows_app(step.get("app", ""))
                           if platform.system() == "Windows"
                           else open_target({"app": step.get("app", "")}))
                log_lines.append(f"{i}. {msg}")
                if not ok:
                    return False, " | ".join(log_lines)
                time.sleep(float(step.get("settle", 6)))

            elif action == "wait":
                time.sleep(float(step.get("seconds", 1)))
                log_lines.append(f"{i}. attente {step.get('seconds', 1)}s")

            elif action == "type":
                text = str(step.get("text", ""))
                pg = _pg()
                # pyautogui.typewrite ne gere pas les accents : on passe par le presse-papier
                if any(ord(c) > 127 for c in text):
                    copied = False
                    try:
                        import subprocess as sp
                        sp.run("clip", input=text.encode("utf-16le"), shell=True, check=True)
                        copied = True
                    except Exception:
                        pass
                    if copied:
                        pg.hotkey("ctrl", "v")
                    else:
                        pg.typewrite(text, interval=0.02)
                else:
                    pg.typewrite(text, interval=0.02)
                log_lines.append(f"{i}. saisie : {text[:40]}")
                time.sleep(0.4)

            elif action == "key":
                keys = step.get("keys") or []
                _pg().hotkey(*[str(k) for k in keys])
                log_lines.append(f"{i}. {'+'.join(keys)}")
                time.sleep(float(step.get("settle", 1.2)))

            elif action == "press":
                _pg().press(str(step.get("key", "enter")))
                log_lines.append(f"{i}. touche {step.get('key')}")
                time.sleep(float(step.get("settle", 0.8)))

            elif action == "open":
                path = os.path.expandvars(os.path.expanduser(str(step.get("path", ""))))
                if not os.path.exists(path):
                    log_lines.append(f"{i}. fichier absent : {path}")
                    return False, " | ".join(log_lines)
                if platform.system() == "Windows":
                    os.startfile(path)  # type: ignore[attr-defined]
                else:
                    subprocess.Popen(["xdg-open", path])
                log_lines.append(f"{i}. ouverture de {os.path.basename(path)}")
                time.sleep(float(step.get("settle", 5)))

            elif action == "close_window":
                _pg().hotkey("alt", "f4")
                log_lines.append(f"{i}. fenetre fermee")
                time.sleep(float(step.get("settle", 1.5)))

            else:
                log_lines.append(f"{i}. etape inconnue : {action}")
        except Exception as e:
            log_lines.append(f"{i}. ERREUR {action} : {e}")
            return False, " | ".join(log_lines)

    return True, " | ".join(log_lines)


def create_word_document(text, filename, close=True, reopen=False):
    """Automatisation COM native Microsoft Word.

    Cree un document vierge, ecrit, enregistre en .docx, ferme Word et peut
    rouvrir le fichier. Aucun clic ni raccourci fragile n'est necessaire.
    """
    if platform.system() != "Windows":
        return False, "Microsoft Word COM est disponible uniquement sous Windows."
    safe_name = "".join(c for c in str(filename) if c not in r'\/:*?"<>|').strip()
    safe_name = safe_name or "Document-Jarvis"
    if not safe_name.lower().endswith(".docx"):
        safe_name += ".docx"
    docs = os.path.join(os.path.expanduser("~"), "Documents")
    os.makedirs(docs, exist_ok=True)
    full = os.path.abspath(os.path.join(docs, safe_name))
    word = doc = None
    try:
        import win32com.client
        word = win32com.client.DispatchEx("Word.Application")
        word.Visible = True
        word.DisplayAlerts = 0
        doc = word.Documents.Add()
        doc.Content.Text = str(text)
        # 16 = wdFormatDocumentDefault (.docx)
        doc.SaveAs2(full, FileFormat=16)
        if close:
            doc.Close(SaveChanges=False)
            doc = None
            word.Quit()
            word = None
        if not os.path.isfile(full):
            return False, f"Word n'a pas cree le fichier attendu : {full}"
        if reopen:
            if word is not None:
                word.Documents.Open(full)
            else:
                os.startfile(full)  # type: ignore[attr-defined]
        return True, f"Document Word enregistre : {full}"
    except ImportError:
        return False, "PyWin32/win32com absent : reinstallez Jarvis Complete."
    except Exception as e:
        return False, f"Automatisation Word impossible : {e}"
    finally:
        if doc is not None and close:
            try: doc.Close(SaveChanges=False)
            except Exception: pass
        if word is not None and close:
            try: word.Quit()
            except Exception: pass


def macro_write_document(app, text, filename, reopen=True):
    """Scenario complet : ouvrir le traitement de texte, ecrire, enregistrer, fermer, rouvrir."""
    docs = os.path.join(os.path.expanduser("~"), "Documents")
    ext = {"word": ".docx", "wordpad": ".rtf", "notepad": ".txt"}.get(app, ".docx")
    full = os.path.join(docs, filename + ext)

    steps = [
        {"do": "launch", "app": app, "settle": 8},
    ]
    if app == "word":
        # Word ouvre l'ecran d'accueil : Ctrl+N force un document vierge
        steps += [{"do": "key", "keys": ["ctrl", "n"], "settle": 3}]
    steps += [
        {"do": "type", "text": text},
        {"do": "key", "keys": ["ctrl", "s"], "settle": 2.5},
    ]
    if app == "word":
        # Word 2016+ : Ctrl+S ouvre le backstage ; Alt+1 ou Entree selectionne "Parcourir"
        steps += [{"do": "key", "keys": ["alt", "1"], "settle": 2.5}]
    steps += [
        {"do": "type", "text": full},
        {"do": "press", "key": "enter", "settle": 3},
        {"do": "press", "key": "enter", "settle": 2},
        {"do": "close_window", "settle": 2.5},
    ]
    if reopen:
        steps += [{"do": "wait", "seconds": 1.5},
                  {"do": "open", "path": full, "settle": 6}]

    ok, detail = run_macro(steps)
    if ok:
        exists = os.path.exists(full)
        return exists, (f"Document enregistre : {full}" if exists
                        else f"Sequence executee mais {full} est introuvable. {detail}")
    return False, detail


# ============ CONTRÔLE FAÇON HUMAIN : raccourcis, presse-papiers, fermeture, Word ===

HOTKEY_ACTIONS = {
    "copy": (("ctrl", "c"), "Copié dans le presse-papiers."),
    "cut": (("ctrl", "x"), "Coupé dans le presse-papiers."),
    "paste": (("ctrl", "v"), "Collé depuis le presse-papiers."),
    "select_all": (("ctrl", "a"), "Tout sélectionné."),
    "save": (("ctrl", "s"), "Document enregistré."),
    "save_as": (("ctrl", "shift", "s"), "Boîte « Enregistrer sous » ouverte."),
    "undo": (("ctrl", "z"), "Dernière action annulée."),
    "redo": (("ctrl", "y"), "Dernière action rétablie."),
    "new_doc": (("ctrl", "n"), "Nouveau document."),
    "close_window": (("alt", "f4"), "Fenêtre active fermée."),
    "delete": (("delete",), "Sélection supprimée."),
    "bold": (("ctrl", "b"), "Texte en gras."),
    "italic": (("ctrl", "i"), "Texte en italique."),
    "find": (("ctrl", "f"), "Recherche ouverte."),
}

def do_hotkey(p):
    """Raccourci clavier générique : action nommée ou liste de touches."""
    if not HAS_GUI:
        return False, "pyautogui indisponible : agent complet requis."
    action = str(p.get("action", "")).lower().replace("-", "_")
    keys = p.get("keys")
    if not keys and action in HOTKEY_ACTIONS:
        keys, message = HOTKEY_ACTIONS[action]
        _pg().hotkey(*keys)
        time.sleep(0.35)
        return True, message
    if keys:
        _pg().hotkey(*[str(k) for k in keys])
        time.sleep(0.35)
        return True, "Raccourci clavier envoyé."
    return False, f"Raccourci inconnu : {action}"


def _set_clipboard_text(text):
    text = str(text or "")
    if platform.system() == "Windows":
        subprocess.run("clip", input=text.encode("utf-16le"), shell=True, check=False)
        return True
    try:
        import pyperclip  # type: ignore
        pyperclip.copy(text)
        return True
    except Exception:
        return False


def _get_clipboard_text():
    if platform.system() == "Windows":
        try:
            r = subprocess.run(["powershell", "-NoProfile", "-Command", "Get-Clipboard -Raw"],
                                capture_output=True, text=True, timeout=8)
            return (r.stdout or "").strip()
        except Exception:
            return ""
    try:
        import pyperclip  # type: ignore
        return pyperclip.paste() or ""
    except Exception:
        return ""


def clipboard_job(p):
    """Presse-papiers : écrire/coller du texte, lire le contenu, ou raccourci."""
    action = str(p.get("action", "")).lower()
    if action == "read":
        content = _get_clipboard_text()
        return (True, f"Presse-papiers : {content[:800]}") if content else (False, "Presse-papiers vide.")
    if p.get("text") is not None:
        if not _set_clipboard_text(p.get("text")):
            return False, "Impossible d'écrire le presse-papiers."
        if p.get("paste", True) and HAS_GUI:
            _pg().hotkey("ctrl", "v")
            time.sleep(0.3)
            return True, "Texte copié puis collé dans la fenêtre active."
        return True, "Texte copié dans le presse-papiers."
    if action in HOTKEY_ACTIONS:
        return do_hotkey(p)
    return False, "Action presse-papiers inconnue."


CLOSE_APP_EXES = {
    "word": "WINWORD.EXE", "microsoft word": "WINWORD.EXE", "winword": "WINWORD.EXE",
    "excel": "EXCEL.EXE", "microsoft excel": "EXCEL.EXE",
    "powerpoint": "POWERPNT.EXE", "power point": "POWERPNT.EXE", "microsoft powerpoint": "POWERPNT.EXE",
    "outlook": "OUTLOOK.EXE", "microsoft outlook": "OUTLOOK.EXE",
    "onenote": "ONENOTE.EXE", "access": "MSACCESS.EXE",
    "chrome": "chrome.exe", "google chrome": "chrome.exe",
    "firefox": "firefox.exe", "mozilla firefox": "firefox.exe",
    "edge": "msedge.exe", "microsoft edge": "msedge.exe",
    "vscode": "Code.exe", "visual studio code": "Code.exe", "vs code": "Code.exe", "code": "Code.exe",
    "spotify": "Spotify.exe", "discord": "Discord.exe", "steam": "steam.exe",
    "vlc": "vlc.exe", "paint": "mspaint.exe", "peinture": "mspaint.exe",
    "notepad": "notepad.exe", "bloc-notes": "notepad.exe", "bloc notes": "notepad.exe",
    "wordpad": "write.exe", "calculatrice": "CalculatorApp.exe", "calc": "CalculatorApp.exe",
    "calculator": "CalculatorApp.exe",
    "terminal": "WindowsTerminal.exe", "powershell": "powershell.exe", "cmd": "cmd.exe",
    "explorateur": "explorer.exe", "explorateur de fichiers": "explorer.exe",
    "telegram": "Telegram.exe", "whatsapp": "WhatsApp.exe", "obsidian": "Obsidian.exe",
    "notepad++": "notepad++.exe", "teams": "ms-teams.exe",
}
# Applications modernes (UWP) : la fermeture douce n'existe pas, on ferme directement.
UWP_FORCE = {"CalculatorApp.exe", "WindowsTerminal.exe", "Telegram.exe", "WhatsApp.exe", "ms-teams.exe"}

def close_app(p):
    """Ferme proprement une application nommée, ou la fenêtre active (Alt+F4)."""
    label = str(p.get("app", "")).lower().strip()
    exe = CLOSE_APP_EXES.get(label)
    if exe:
        if exe in UWP_FORCE:
            closed = subprocess.run(["taskkill", "/F", "/IM", exe], capture_output=True,
                                    text=True, timeout=10)
            ok = closed.returncode == 0
            return ok, (f"{label.capitalize()} fermé." if ok else f"{label} est déjà fermé ou introuvable.")
        graceful = subprocess.run(["taskkill", "/IM", exe], capture_output=True,
                                 text=True, timeout=10)
        if graceful.returncode == 0:
            return True, f"{label.capitalize()} est fermé."
        if p.get("force"):
            forced = subprocess.run(["taskkill", "/F", "/IM", exe], capture_output=True,
                                    text=True, timeout=10)
            return (forced.returncode == 0,
                    f"{label.capitalize()} forcé." if forced.returncode == 0
                    else f"{label} est introuvable ou déjà fermé.")
        return False, f"{label} ne répond pas ou n'est pas ouvert."
    if HAS_GUI:
        _pg().hotkey("alt", "f4")
        time.sleep(0.5)
        return True, "Fenêtre active fermée."
    return False, "Bureau inaccessible (pyautogui absent)."


def _find_document(filename):
    """Cherche un .docx dans Documents/Bureau/Téléchargements (2 niveaux)."""
    name = str(filename).strip().strip('"').strip("'")
    if os.path.isabs(name) and os.path.exists(name):
        return name
    if not name.lower().endswith(".docx"):
        name_try = name + ".docx"
    else:
        name_try = name
    bases = [os.path.expanduser("~/Documents"), os.path.expanduser("~/Desktop"),
             os.path.expanduser("~/Downloads")]
    for base in bases:
        cand = os.path.join(base, name_try)
        if os.path.exists(cand):
            return cand
        for root, dirs, files in os.walk(base):
            if root.count(os.sep) - base.count(os.sep) > 2:
                dirs[:] = []
                continue
            for f in files:
                if f.lower() == name_try.lower():
                    return os.path.join(root, f)
    return os.path.join(bases[0], name_try)


def _docx_paragraphs(text):
    import xml.sax.saxutils as saxutils
    out = []
    for line in str(text).split("\n"):
        safe = saxutils.escape(line)
        out.append('<w:p><w:r><w:t xml:space="preserve">%s</w:t></w:r></w:p>' % safe)
    return "".join(out)


def docx_write(p):
    """Crée ou complète un .docx avec la bibliothèque standard (ouvrable dans Word).

    payload : { filename|path, text, mode: append|replace, save_as }
    """
    import re as _re
    import zipfile
    text = str(p.get("text", ""))
    mode = str(p.get("mode", "append")).lower()
    filename = str(p.get("filename") or p.get("path") or "Document-Jarvis")
    full = _find_document(filename)
    if p.get("save_as"):
        safe = _re.sub(r'[\\/:*?"<>|]', "", str(p["save_as"]))
        if not safe.lower().endswith(".docx"):
            safe += ".docx"
        full = os.path.join(os.path.expanduser("~/Documents"), safe)
    paras = _docx_paragraphs(text)

    # Complément d'un document existant : insérer avant le bloc de mise en page.
    if os.path.exists(full) and mode != "replace":
        tmp = full + ".tmp"
        try:
            with zipfile.ZipFile(full, "r") as zin, \
                 zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
                for item in zin.infolist():
                    data = zin.read(item.filename)
                    if item.filename == "word/document.xml":
                        xml = data.decode("utf-8")
                        if "<w:sectPr" in xml:
                            xml = _re.sub(r"(<w:sectPr\b.*?</w:sectPr>)",
                                          paras + r"\1", xml, count=1, flags=_re.S)
                        else:
                            xml = xml.replace("</w:body>", paras + "</w:body>")
                        data = xml.encode("utf-8")
                    zout.writestr(item, data)
            os.replace(tmp, full)
            return True, f"Document Word mis à jour : {full}"
        except Exception as e:
            try:
                if os.path.exists(tmp): os.remove(tmp)
            except Exception:
                pass
            return False, f"Impossible de modifier le .docx : {e}"

    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="word/document.xml"/></Relationships>'
    )
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body>" + paras +
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
        '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>'
        "</w:body></w:document>"
    )
    try:
        with zipfile.ZipFile(full, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("[Content_Types].xml", content_types)
            z.writestr("_rels/.rels", rels)
            z.writestr("word/document.xml", document)
        return True, f"Document Word enregistré : {full}"
    except Exception as e:
        return False, f"Impossible d'écrire le .docx : {e}"


def word_edit(p):
    """Point d'entrée de l'agent : création / ajout de texte dans un document Word."""
    return docx_write(p)


# ============ RECONNAISSANCE VOCALE (STT) COTE PC ============
# Electron/Chromium ne fournit PAS l'API Web Speech (pas de cle Google
# integree hors Chrome). La dictee est donc assuree ici, par le PC.

def transcribe_after_wake(timeout=6, phrase_limit=14, lang="fr-FR"):
    """Capture une commande via sounddevice puis la transcrit.

    IMPORTANT : n'ouvre jamais PyAudio / un second microphone. Le flux du
    wake word est ferme avant cet appel ; sounddevice reprend le meme micro.
    """
    try:
        import numpy as np
        import sounddevice as sd
        import speech_recognition as sr
    except ImportError as e:
        return None, f"Module STT absent : {e}"

    sample_rate = 16000
    block = 1600                 # 100 ms
    max_blocks = int(phrase_limit * sample_rate / block)
    wait_blocks = int(timeout * sample_rate / block)
    frames = []
    noise_samples = []
    speech_started = False
    silent_blocks = 0

    try:
        with sd.InputStream(samplerate=sample_rate, channels=1, dtype="int16",
                            blocksize=block) as stream:
            for i in range(max_blocks):
                if AUDIO_OUTPUT_ACTIVE.is_set():
                    return None, "Ecoute suspendue pendant la reponse de Jarvis."
                frame, overflowed = stream.read(block)
                if overflowed:
                    continue
                mono = frame[:, 0].copy()
                # int64 evite le debordement lors du carre
                rms = float(np.sqrt(np.mean(mono.astype(np.float64) ** 2)))

                if not speech_started and len(noise_samples) < 4:
                    noise_samples.append(rms)
                    continue
                baseline = (sum(noise_samples) / len(noise_samples)) if noise_samples else 70.0
                threshold = max(180.0, baseline * 2.6)

                if rms >= threshold:
                    speech_started = True
                    silent_blocks = 0
                    frames.append(mono)
                elif speech_started:
                    frames.append(mono)
                    silent_blocks += 1
                    # 1 seconde de silence termine naturellement la phrase
                    if silent_blocks >= 10:
                        break
                elif i >= wait_blocks:
                    return None, "Aucune parole detectee apres le mot-cle."
    except Exception as e:
        return None, f"Micro sounddevice indisponible : {e}"

    if not frames:
        return None, "Commande vocale vide."
    pcm = np.concatenate(frames).astype(np.int16).tobytes()
    audio = sr.AudioData(pcm, sample_rate, 2)
    rec = sr.Recognizer()

    # 1. Vosk hors ligne si l'utilisateur a ajoute un modele francais.
    try:
        here = os.path.dirname(os.path.abspath(sys.argv[0]))
        vosk_dir = os.path.join(here, "models", "vosk-fr")
        if os.path.isdir(vosk_dir):
            old_model = os.environ.get("VOSK_MODEL_PATH")
            os.environ["VOSK_MODEL_PATH"] = vosk_dir
            raw = rec.recognize_vosk(audio)
            import json as _json
            text = _json.loads(raw).get("text", "").strip()
            if old_model is None:
                os.environ.pop("VOSK_MODEL_PATH", None)
            else:
                os.environ["VOSK_MODEL_PATH"] = old_model
            if text:
                return text, "vosk-local"
    except Exception:
        pass

    # 2. Google Speech gratuit pour les commandes (connexion Internet requise).
    try:
        text = rec.recognize_google(audio, language=lang).strip()
        return (text, "google") if text else (None, "Transcription vide.")
    except sr.UnknownValueError:
        return None, "Phrase non comprise."
    except sr.RequestError as e:
        return None, f"Service de transcription indisponible : {e}"
    except Exception as e:
        return None, f"Transcription impossible : {type(e).__name__}"


def push_command_to_jarvis(server, text):
    """Envoie la commande dictee a Jarvis, qui repondra a voix haute."""
    try:
        r = requests.post(f"{server.rstrip('/')}/api/remote",
                          json={"text": text, "origin": "voice-agent"}, timeout=15)
        return r.ok
    except Exception:
        return False



# ============ GESTION COMPLETE DES FICHIERS ============

def _resolve(path):
    """Resout un chemin : variables, ~, dossiers parles, recherche par nom."""
    if not path:
        return None
    raw = str(path).strip().strip('"').strip("'")
    shortcuts = {
        "bureau": "~/Desktop", "desktop": "~/Desktop",
        "documents": "~/Documents", "mes documents": "~/Documents",
        "telechargements": "~/Downloads", "downloads": "~/Downloads",
        "images": "~/Pictures", "musique": "~/Music", "videos": "~/Videos",
    }
    low = raw.lower()
    for name, target in shortcuts.items():
        if low == name:
            return os.path.expanduser(target)
        if low.startswith(name + "/") or low.startswith(name + "\\"):
            return os.path.join(os.path.expanduser(target), raw[len(name) + 1:])
    full = os.path.expandvars(os.path.expanduser(raw))
    if os.path.isabs(full) or os.path.exists(full):
        return full
    # nom simple : on cherche dans les dossiers personnels
    for base in ("~/Desktop", "~/Documents", "~/Downloads"):
        cand = os.path.join(os.path.expanduser(base), raw)
        if os.path.exists(cand):
            return cand
    return os.path.join(os.path.expanduser("~/Documents"), raw)


def file_op(job):
    """Operations fichiers : read, write, append, create, copy, move,
    delete, list, search, execute, mkdir, info, open."""
    op = (job.get("op") or "").lower()
    path = _resolve(job.get("path"))
    try:
        if op == "read":
            if not os.path.isfile(path):
                return False, f"Fichier introuvable : {path}"
            size = os.path.getsize(path)
            if size > 2_000_000:
                return False, f"Fichier trop volumineux ({size // 1024} Ko)."
            if path.lower().endswith(".docx"):
                try:
                    import zipfile as _z, re as _re
                    with _z.ZipFile(path) as z:
                        xml = z.read("word/document.xml").decode("utf-8", "replace")
                    txt = _re.sub(r"<[^>]+>", " ", xml.replace("</w:p>", "\n"))
                    txt = _re.sub(r"[ \t]{2,}", " ", txt).strip()
                    return True, txt[:6000]
                except Exception as e:
                    return False, f"Lecture docx impossible : {e}"
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                return True, f.read()[:6000]

        if op in ("write", "create"):
            os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(str(job.get("content", "")))
            return True, f"Fichier ecrit : {path}"

        if op == "append":
            os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
            with open(path, "a", encoding="utf-8") as f:
                f.write(str(job.get("content", "")))
            return True, f"Texte ajoute a {path}"

        if op in ("copy", "move"):
            import shutil
            dest = _resolve(job.get("dest"))
            if not os.path.exists(path):
                return False, f"Source introuvable : {path}"
            if os.path.isdir(dest):
                dest = os.path.join(dest, os.path.basename(path))
            os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
            if os.path.isdir(path):
                shutil.copytree(path, dest, dirs_exist_ok=True)
                if op == "move":
                    shutil.rmtree(path)
            else:
                shutil.copy2(path, dest)
                if op == "move":
                    os.remove(path)
            return True, f"{'Deplace' if op == 'move' else 'Copie'} vers {dest}"

        if op == "delete":
            import shutil
            if not os.path.exists(path):
                return False, f"Introuvable : {path}"
            # Corbeille si send2trash est disponible, sinon suppression directe
            try:
                from send2trash import send2trash
                send2trash(path)
                return True, f"Envoye a la corbeille : {path}"
            except Exception:
                pass
            shutil.rmtree(path) if os.path.isdir(path) else os.remove(path)
            return True, f"Supprime : {path}"

        if op == "mkdir":
            os.makedirs(path, exist_ok=True)
            return True, f"Dossier cree : {path}"

        if op == "list":
            if not os.path.isdir(path):
                return False, f"Dossier introuvable : {path}"
            items = sorted(os.listdir(path))[:80]
            marked = [(n + "/") if os.path.isdir(os.path.join(path, n)) else n for n in items]
            return True, (", ".join(marked) if marked else "(dossier vide)")

        if op == "search":
            pattern = str(job.get("pattern", "")).lower()
            roots = [os.path.expanduser(d) for d in ("~/Desktop", "~/Documents", "~/Downloads")]
            found = []
            for root in roots:
                for dirpath, dirs, files in os.walk(root):
                    if dirpath.count(os.sep) - root.count(os.sep) > 4:
                        dirs[:] = []
                        continue
                    for name in files:
                        if pattern in name.lower():
                            found.append(os.path.join(dirpath, name))
                            if len(found) >= 25:
                                return True, "\n".join(found)
            return (len(found) > 0), ("\n".join(found) if found else f"Aucun fichier contenant '{pattern}'")

        if op == "info":
            if not os.path.exists(path):
                return False, f"Introuvable : {path}"
            st = os.stat(path)
            import datetime as _dt
            return True, (f"{path} | {st.st_size} octets | modifie le "
                          f"{_dt.datetime.fromtimestamp(st.st_mtime):%d/%m/%Y %H:%M}")

        if op in ("execute", "run", "open"):
            if not os.path.exists(path):
                return False, f"Introuvable : {path}"
            if platform.system() == "Windows":
                os.startfile(path)  # type: ignore[attr-defined]
            elif platform.system() == "Darwin":
                subprocess.Popen(["open", path])
            else:
                subprocess.Popen(["xdg-open", path])
            return True, f"Ouvert : {os.path.basename(path)}"

        return False, f"Operation inconnue : {op}"
    except PermissionError:
        return False, f"Acces refuse : {path}"
    except Exception as e:
        return False, f"Erreur {op} : {e}"


def list_installed_apps(limit=120):
    """Inventaire des logiciels installes (menu Demarrer + registre)."""
    names = set()
    if platform.system() == "Windows":
        for base in (os.path.join(os.environ.get("ProgramData", ""), r"Microsoft\Windows\Start Menu\Programs"),
                     os.path.join(os.environ.get("APPDATA", ""), r"Microsoft\Windows\Start Menu\Programs")):
            if not base or not os.path.isdir(base):
                continue
            for dirpath, _dirs, files in os.walk(base):
                for f in files:
                    if f.lower().endswith(".lnk"):
                        names.add(os.path.splitext(f)[0])
        try:
            import winreg
            for hive, key in ((winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
                              (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall")):
                try:
                    k = winreg.OpenKey(hive, key)
                except OSError:
                    continue
                for i in range(winreg.QueryInfoKey(k)[0]):
                    try:
                        sub = winreg.OpenKey(k, winreg.EnumKey(k, i))
                        names.add(winreg.QueryValueEx(sub, "DisplayName")[0])
                    except OSError:
                        continue
        except Exception:
            pass
    out = sorted(n for n in names if n and len(n) < 60)[:limit]
    return (len(out) > 0), (", ".join(out) if out else "Aucun logiciel detecte.")


def do_shutdown(reboot, delay):
    def worker():
        time.sleep(delay)
        system = platform.system()
        if system == "Windows":
            subprocess.Popen(["shutdown", "/r" if reboot else "/s", "/t", "0"], shell=False)
        else:
            subprocess.Popen("systemctl reboot" if reboot else "systemctl poweroff", shell=True)
    threading.Thread(target=worker, daemon=True).start()
    return True, f"{'Redémarrage' if reboot else 'Extinction'} dans {delay} s (annulable)."

def cancel_shutdown():
    system = platform.system()
    if system == "Windows":
        subprocess.Popen("shutdown /a", shell=True)
    return True, "Annulation demandée."

def lock_session():
    system = platform.system()
    try:
        if system == "Windows":
            subprocess.Popen("rundll32.exe user32.dll,LockWorkStation", shell=True)
        elif system == "Darwin":
            subprocess.Popen(["/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession", "-suspend"])
        else:
            subprocess.Popen("loginctl lock-session", shell=True)
        return True, "Session verrouillée."
    except Exception as e:
        return False, str(e)

def execute(job):
    kind = job.get("kind", "")
    p = job.get("payload", {}) or {}
    try:
        if kind == "shell":
            return run_shell(p.get("command", ""))
        if kind == "open":
            return open_target(p)
        if kind == "mouse_move":
            if not HAS_GUI: return False, "pyautogui indisponible."
            if p.get("center"):
                w, h = pyautogui.size()
                pyautogui.moveTo(w // 2, h // 2, duration=0.4)
            elif p.get("x") is not None and p.get("y") is not None:
                pyautogui.moveTo(int(p["x"]), int(p["y"]), duration=0.4)
            else:
                pyautogui.moveRel(int(p.get("dx", 0)), int(p.get("dy", 0)), duration=0.5)
            x, y = pyautogui.position()
            return True, f"Souris en ({x}, {y})."
        if kind == "mouse_click":
            if not HAS_GUI: return False, "pyautogui indisponible."
            pyautogui.click(button=p.get("button", "left"), clicks=int(p.get("clicks", 1)), interval=0.15)
            return True, "Clic envoyé."
        if kind == "type":
            if not HAS_GUI: return False, "pyautogui indisponible."
            pyautogui.typewrite(str(p.get("text", ""))[:500], interval=0.02)
            return True, "Texte saisi."
        if kind == "hotkey":
            return do_hotkey(p) + (None,)
        if kind == "clipboard":
            return clipboard_job(p) + (None,)
        if kind == "close_app":
            return close_app(p) + (None,)
        if kind == "word_edit":
            return word_edit(p) + (None,)
        if kind == "listen_control":
            enabled = bool(p.get("enabled", True))
            LISTEN_ENABLED.set() if enabled else LISTEN_ENABLED.clear()
            WAKE_STATE.update(
                active=enabled,
                mic_status="ecoute continue" if enabled else "micro coupe par l'utilisateur",
                last_error="",
            )
            return True, ("Micro active." if enabled else "Micro coupe."), None
        if kind == "speak":
            AUDIO_OUTPUT_ACTIVE.set()
            try:
                # Laisse 150 ms au flux wake pour constater le verrou et se fermer.
                time.sleep(0.15)
                ok = speak_local(str(p.get("text", "")), wait=True)
            finally:
                AUDIO_OUTPUT_ACTIVE.clear()
            return ok, ("Phrase prononcee." if ok else "Synthese native indisponible."), None
        if kind == "file":
            return file_op(p) + (None,)
        if kind == "list_apps":
            return list_installed_apps() + (None,)
        if kind == "macro":
            return run_macro(p.get("steps") or []) + (None,)
        if kind == "word_document":
            return create_word_document(
                p.get("text", ""), p.get("filename", "Document-Jarvis"),
                bool(p.get("close", True)), bool(p.get("reopen", False))) + (None,)
        if kind == "write_document":
            return macro_write_document(
                p.get("app", "word"), p.get("text", ""),
                p.get("filename", "document"), bool(p.get("reopen", True))) + (None,)
        if kind == "web_search":
            return web_search(p.get("query", ""), int(p.get("limit", 6))) + (None,)
        if kind == "fetch_url":
            return fetch_url(p.get("url", "")) + (None,)
        if kind == "screenshot":
            data, err = screenshot_b64()
            return (data is not None), (err or "capture ok") if data is None else "capture ok", data
        if kind == "lock":
            return lock_session() + (None,)
        if kind == "shutdown":
            return do_shutdown(bool(p.get("reboot")), int(p.get("delay", 30))) + (None,)
        if kind == "cancel_shutdown":
            return cancel_shutdown() + (None,)
        return False, f"Travail inconnu : {kind}", None
    except Exception as e:
        return False, f"Erreur {kind} : {e}", None

# ═══════════════════ 🎙️ MOT-CLÉ VOCAL « JARVIS » ═══════════════════════════
#
#  Détection 100 % locale et hors ligne via openWakeWord (modèle pré-entraîné
#  « hey_jarvis », licence Apache 2.0). Aucun audio ne quitte votre machine.
#
#  Seuil : le modèle est entraîné sur l'anglais « hey jarvis ». Mesures faites
#  sur voix de synthèse française (seuil retenu 0.08) :
#      « hey jarvis » (EN) 0.998 | « Jarvis » (FR) 0.429 | « Jarvis ! » 0.207
#      « Hey Jarvis » (FR) 0.197 | « Jarvis, allume… » 0.139
#      pires négatifs : « il arrive… » 0.016, « bonjour… » 0.008, jardin/Java 0.002
#  → marge de séparation ≈ 8,7× entre positifs et négatifs.

WAKE_FRAME = 1280           # 80 ms à 16 kHz
WAKE_SAMPLE_RATE = 16000
_last_wake_at = 0.0
WAKE_STATE = {
    "active": False,
    "mic_status": "initialisation",
    "last_error": "",
}
# Quand Jarvis parle par les haut-parleurs, le wake word ferme son micro :
# sinon il pourrait entendre son propre nom et se reveiller tout seul.
AUDIO_OUTPUT_ACTIVE = threading.Event()
LISTEN_ENABLED = threading.Event()
LISTEN_ENABLED.set()


def speak_local(text, wait=False):
    """Voix native du PC. wait=True garantit que la phrase est terminee
    avant de rendre le micro a la dictee."""
    system = platform.system()
    try:
        if system == "Windows":
            safe = str(text).replace("'", "''")
            ps = ("Add-Type -AssemblyName System.Speech; "
                  "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
                  "try { $s.SelectVoiceByHints('NotSet','NotSet',0,"
                  "[System.Globalization.CultureInfo]::GetCultureInfo('fr-FR')) } catch {}; "
                  f"$s.Speak('{safe}')")
            cmd = ["powershell", "-NoProfile", "-Command", ps]
            if wait:
                subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               timeout=max(15, len(str(text)) // 6))
            else:
                subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                 creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            return True
        if system == "Darwin":
            cmd = ["say", "-v", "Thomas", str(text)]
            if wait:
                subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return True
        for cmd in (["espeak-ng", "-v", "fr", str(text)],
                    ["espeak", "-v", "fr", str(text)],
                    ["spd-say", "-l", "fr", str(text)]):
            try:
                if wait:
                    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                return True
            except FileNotFoundError:
                continue
    except Exception:
        pass
    try:
        import pyttsx3
        e = pyttsx3.init(); e.say(str(text)); e.runAndWait()
        return True
    except Exception:
        return False


def open_jarvis_ui(server, reason="wake"):
    """Ouvre/restaure la fenêtre bureau Jarvis. Repli navigateur si le shell
    Electron n'est pas installé (agent seul Linux/macOS)."""
    url = f"{server.rstrip('/')}/?wake=1&src={reason}"
    try:
        # Paquet Windows complet : agent/ est juste sous la racine Jarvis.
        if platform.system() == "Windows":
            here = os.path.dirname(os.path.abspath(sys.argv[0]))
            launcher = os.path.abspath(os.path.join(here, "..", "Ouvrir-Jarvis.vbs"))
            if os.path.exists(launcher):
                subprocess.Popen(
                    ["wscript.exe", launcher],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
                return True, "fenêtre bureau J.A.R.V.I.S."

        import webbrowser
        webbrowser.open(url, new=2)
        return True, url
    except Exception as e:
        return False, f"Ouverture impossible : {e}"


def _load_wake_model(threshold):
    """Charge le modèle « hey_jarvis » : local (dossier models/) si présent,
    sinon ressources du paquet, sinon téléchargement unique."""
    from openwakeword.model import Model
    import openwakeword

    here = os.path.dirname(os.path.abspath(sys.argv[0]))
    local_model = os.path.join(here, "models", "hey_jarvis_v0.1.onnx")
    if os.path.exists(local_model):
        return Model(wakeword_model_paths=[local_model], inference_framework="onnx")

    try:
        from openwakeword.utils import download_models
        download_models(model_names=["hey_jarvis"])
    except Exception:
        pass            # modèles déjà présents ou hors ligne
    return Model(wakeword_models=["hey_jarvis"], inference_framework="onnx")


def wake_score_file(path, threshold=0.08):
    """Analyse un fichier WAV 16 kHz mono : renvoie (détecté, score max)."""
    import wave
    import numpy as np
    model = _load_wake_model(threshold)
    with wave.open(path, "rb") as w:
        if w.getframerate() != WAKE_SAMPLE_RATE or w.getnchannels() != 1:
            return False, -1.0
        audio = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    model.reset()
    best = 0.0
    for i in range(0, max(0, len(audio) - WAKE_FRAME), WAKE_FRAME):
        best = max(best, max(model.predict(audio[i:i + WAKE_FRAME]).values()))
    return best >= threshold, best


def wake_selftest(paths, threshold=0.08):
    """Vérifie la chaîne de détection sans micro, à partir de fichiers WAV."""
    print(f"\n=== AUTOTEST MOT-CLÉ « JARVIS » (seuil {threshold}) ===")
    ok = failed = 0
    for p in paths:
        expect_pos = "neg" not in os.path.basename(p).lower()
        detected, score = wake_score_file(p, threshold)
        good = (detected == expect_pos)
        ok, failed = (ok + 1, failed) if good else (ok, failed + 1)
        print(f"  {os.path.basename(p):26s} score={score:6.3f} "
              f"{'DÉTECTÉ' if detected else 'ignoré ':8s} [{'OK' if good else 'ÉCHEC'}]")
    print(f"=== {ok} conformes, {failed} écarts ===\n")
    return failed == 0


def wake_listener(server, threshold=0.08, cooldown=5.0):
    """Ecoute permanente en DEUX phases exclusives :

      1. un flux sounddevice attend le mot-cle ;
      2. ce flux est ferme, puis la dictee reprend le micro.

    Deux clients audio concurrents etaient la cause des commandes ignorees.
    """
    global _last_wake_at
    try:
        import sounddevice as sd
    except ImportError:
        WAKE_STATE.update(active=False, mic_status="sounddevice absent",
                          last_error="pip install sounddevice numpy openwakeword")
        log("Ecoute impossible : sounddevice absent")
        return
    try:
        model = _load_wake_model(threshold)
    except Exception as e:
        WAKE_STATE.update(active=False, mic_status="modele absent", last_error=str(e))
        log(f"Modele de mot-cle indisponible : {e}")
        return

    log(f"Micro arme - dites Jarvis (seuil {threshold}).")
    WAKE_STATE.update(active=False, mic_status="ouverture du micro", last_error="")

    try:
        while True:
            # Ne jamais ecouter les propres haut-parleurs de Jarvis.
            while AUDIO_OUTPUT_ACTIVE.is_set():
                WAKE_STATE["mic_status"] = "pause pendant la parole"
                time.sleep(0.1)

            detected_score = None
            interrupted_by_output = False
            # PHASE 1 : wake word. Le contexte ferme le micro des qu'il est detecte.
            try:
                with sd.InputStream(samplerate=WAKE_SAMPLE_RATE, channels=1,
                                    dtype="int16", blocksize=WAKE_FRAME) as stream:
                    WAKE_STATE.update(active=True, mic_status="mot-cle arme", last_error="")
                    while True:
                        if AUDIO_OUTPUT_ACTIVE.is_set():
                            interrupted_by_output = True
                            break
                        frame, overflowed = stream.read(WAKE_FRAME)
                        if overflowed:
                            continue
                        score = max(model.predict(frame[:, 0]).values())
                        now = time.time()
                        if score >= threshold and now - _last_wake_at > cooldown:
                            detected_score = score
                            _last_wake_at = now
                            break
                # A ce point le InputStream est FERME avant toute autre capture.
            except Exception as e:
                WAKE_STATE.update(active=False, mic_status="erreur micro", last_error=str(e))
                log(f"Erreur ouverture micro : {e}")
                time.sleep(3)
                continue

            if interrupted_by_output:
                WAKE_STATE["mic_status"] = "pause pendant la parole"
                continue
            if detected_score is None:
                continue

            WAKE_STATE.update(active=True, mic_status="mot-cle detecte", last_error="")
            log(f"Mot-cle detecte (score {detected_score:.3f})")
            opened, info = open_jarvis_ui(server)
            log(f"   {'fenetre : ' + info if opened else info}")

            # Confirmation synchrone : aucune fuite de la voix de Jarvis dans sa dictee.
            AUDIO_OUTPUT_ACTIVE.set()
            try:
                speak_local("Oui, je vous ecoute.", wait=True)
            finally:
                AUDIO_OUTPUT_ACTIVE.clear()
            time.sleep(0.25)

            # PHASE 2 : commande. Un seul flux audio existe a cet instant.
            WAKE_STATE["mic_status"] = "ecoute de la commande"
            text, how = transcribe_after_wake()
            if text:
                log(f"   dictee ({how}) : {text}")
                if push_command_to_jarvis(server, text):
                    log("   commande transmise a Jarvis")
                else:
                    WAKE_STATE["last_error"] = "moteur injoignable"
                    speak_local("Je n'ai pas pu joindre mon moteur.", wait=False)
            else:
                log(f"   {how}")
                WAKE_STATE["last_error"] = how
                speak_local("Je n'ai pas compris.", wait=False)

            model.reset()
            _last_wake_at = time.time()
            WAKE_STATE["mic_status"] = "rearmement"
            time.sleep(0.4)

    except KeyboardInterrupt:
        WAKE_STATE.update(active=False, mic_status="arrete", last_error="")
        log("Ecoute du mot-cle arretee.")
    except Exception as e:
        WAKE_STATE.update(active=False, mic_status="erreur", last_error=str(e))
        log(f"Erreur micro fatale : {e}")


def continuous_listener(server):
    """Mode mains libres par defaut : aucune formule d'activation.

    Chaque phrase finale est envoyee a Jarvis. Le micro se ferme pendant les
    reponses natives afin d'eviter que Jarvis se reponde a lui-meme.
    """
    WAKE_STATE.update(active=False, mic_status="ouverture du micro continu", last_error="")
    log("Ecoute vocale continue active - parlez directement.")

    try:
        while True:
            while not LISTEN_ENABLED.is_set():
                WAKE_STATE.update(active=False, mic_status="micro coupe par l'utilisateur", last_error="")
                time.sleep(0.15)
            while AUDIO_OUTPUT_ACTIVE.is_set():
                WAKE_STATE["mic_status"] = "pause pendant la parole"
                time.sleep(0.1)

            WAKE_STATE.update(active=True, mic_status="ecoute continue", last_error="")
            text, how = transcribe_after_wake(timeout=30, phrase_limit=18)

            if text:
                WAKE_STATE["mic_status"] = "traitement de la commande"
                log(f"Dictee continue ({how}) : {text}")
                open_jarvis_ui(server, reason="voice")
                if push_command_to_jarvis(server, text):
                    log("Commande vocale transmise a Jarvis")
                else:
                    WAKE_STATE["last_error"] = "moteur injoignable"
                    time.sleep(1)
            else:
                # Silence normal, parole de Jarvis ou phrase non comprise :
                # on ne prononce rien, sinon cela créerait une boucle audio.
                expected = (
                    "Aucune parole" in how or
                    "Ecoute suspendue" in how or
                    "Commande vocale vide" in how or
                    "Phrase non comprise" in how
                )
                if not expected:
                    WAKE_STATE["last_error"] = how
                    log(f"STT : {how}")
                    time.sleep(1)

            WAKE_STATE["mic_status"] = "rearmement continu"
            time.sleep(0.15)

    except KeyboardInterrupt:
        WAKE_STATE.update(active=False, mic_status="arrete", last_error="")
    except Exception as e:
        WAKE_STATE.update(active=False, mic_status="erreur micro", last_error=str(e))
        log(f"Ecoute continue arretee : {e}")


# ─────────────────────────────── AUTOSTART ──────────────────────────────────

def install_autostart():
    exe = os.path.abspath(sys.argv[0])
    args = " ".join(a for a in sys.argv[1:] if a != "--autostart")
    system = platform.system()
    try:
        if system == "Windows":
            import winreg
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                                 r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE)
            # pythonw.exe plutôt que python.exe : aucune fenêtre console
            # ne doit apparaître à chaque ouverture de session Windows.
            py = sys.executable
            if py.lower().endswith("python.exe"):
                pyw = py[: -len("python.exe")] + "pythonw.exe"
                if os.path.exists(pyw):
                    py = pyw
            winreg.SetValueEx(key, "JarvisAgent", 0, winreg.REG_SZ, f'"{py}" "{exe}" {args} --daemon')
            winreg.CloseKey(key)
        elif system == "Darwin":
            plist = os.path.expanduser("~/Library/LaunchAgents/ai.jarvis.agent.plist")
            with open(plist, "w") as f:
                f.write(f"""<?xml version="1.0"?>
<plist version="1.0"><dict><key>Label</key><string>ai.jarvis.agent</string>
<key>ProgramArguments</key><array><string>{sys.executable}</string><string>{exe}</string><string>--daemon</string></array>
<key>RunAtLoad</key><true/></dict></plist>""")
            subprocess.run(["launchctl", "load", plist], check=False)
        else:
            svc = os.path.expanduser("~/.config/systemd/user/jarvis-agent.service")
            os.makedirs(os.path.dirname(svc), exist_ok=True)
            with open(svc, "w") as f:
                f.write(f"""[Unit]
Description=Jarvis PC Agent

[Service]
ExecStart={sys.executable} {exe} {args} --daemon
Restart=always

[Install]
WantedBy=default.target
""")
            subprocess.run("systemctl --user daemon-reload && systemctl --user enable jarvis-agent", shell=True, check=False)
        log("Démarrage automatique installé.")
    except Exception as e:
        log(f"Autostart échoué : {e}")

# ──────────────────────────────── BOUCLE ────────────────────────────────────

def acquire_singleton():
    """Empêche deux agents d'écouter le même micro en parallèle."""
    if platform.system() != "Windows":
        return True
    try:
        import ctypes
        handle = ctypes.windll.kernel32.CreateMutexW(None, False, "Local\\JarvisAgentSingleton")
        # ERROR_ALREADY_EXISTS = 183 ; conserver handle dans le module
        globals()["_jarvis_mutex"] = handle
        return ctypes.windll.kernel32.GetLastError() != 183
    except Exception:
        return True


def main():
    global ARGS
    ap = argparse.ArgumentParser(description="Agent PC de Jarvis")
    ap.add_argument("--server", help="URL du cerveau Jarvis")
    ap.add_argument("--name", default=None)
    ap.add_argument("--autostart", action="store_true")
    ap.add_argument("--unsafe", action="store_true")
    ap.add_argument("--daemon", action="store_true")
    ap.add_argument("--wake", action="store_true",
                    help="exige le mot-cle Jarvis (par defaut : ecoute directe sans mot-cle)")
    ap.add_argument("--no-wake", action="store_true", help="desactive toute ecoute vocale")
    ap.add_argument("--wake-threshold", type=float, default=0.08,
                    help="seuil de détection (0.08 calibré pour le français)")
    ap.add_argument("--selftest", nargs="*", metavar="WAV",
                    help="teste la détection sur des fichiers WAV 16 kHz mono")
    ARGS = ap.parse_args()

    if ARGS.selftest is None and not acquire_singleton():
        log("Un autre agent Jarvis est déjà actif. Arrêt de cette copie.")
        return

    # Autotest : ne nécessite ni micro, ni serveur
    if ARGS.selftest is not None:
        files = ARGS.selftest or sorted(glob.glob("*.wav"))
        if not files:
            print("Aucun WAV fourni. Exemple : --selftest voix.wav")
            sys.exit(1)
        sys.exit(0 if wake_selftest(files, ARGS.wake_threshold) else 1)

    cfg = load_config()
    server = (ARGS.server or cfg.get("server") or "").rstrip("/")
    if not server:
        # Installateur .exe : l'adresse du cerveau est écrite dans server_url.txt
        try:
            sidecar = os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), "server_url.txt")
            if os.path.exists(sidecar):
                with open(sidecar, "r", encoding="utf-8") as f:
                    server = f.read().strip().rstrip("/")
                if server:
                    cfg["server"] = server
                    save_config(cfg)
        except Exception:
            pass
    if not server:
        print("Indiquez le serveur : --server https://votre-jarvis")
        print("ou créez server_url.txt à côté du programme contenant cette adresse.")
        sys.exit(1)

    name = ARGS.name or cfg.get("name") or f"{platform.node() or 'PC'}"
    system = platform.system().lower()

    # Enregistrement (idempotent via config)
    if not cfg.get("token") or cfg.get("server") != server:
        r = requests.post(f"{server}/api/node",
                          json={"action": "register", "name": name, "platform": system}, timeout=15)
        data = r.json()
        cfg.update({"server": server, "name": name,
                    "nodeId": data["nodeId"], "token": data["token"]})
        save_config(cfg)
        log(f"Enregistré auprès de {server} en tant que « {name} » (id {cfg['nodeId']}).")
    else:
        log(f"Configuration rechargée pour « {name} ».")

    if ARGS.autostart:
        install_autostart()

    # Ecoute vocale active par defaut, SANS mot-cle. L'option --wake remet
    # le comportement historique « Jarvis » si l'utilisateur le souhaite.
    if not ARGS.no_wake:
        target = wake_listener if ARGS.wake else continuous_listener
        args = (server, ARGS.wake_threshold) if ARGS.wake else (server,)
        threading.Thread(target=target, args=args, daemon=True).start()

    log("Jarvis a les mains sur ce PC. En attente d'ordres… (Ctrl+C pour stopper)")

    while True:
        try:
            r = requests.post(f"{server}/api/node",
                              json={
                                  "action": "poll", "nodeId": cfg["nodeId"], "token": cfg["token"],
                                  "wakeActive": bool(WAKE_STATE["active"]),
                                  "micStatus": WAKE_STATE["mic_status"],
                                  "lastError": WAKE_STATE["last_error"],
                              },
                              timeout=15)
            jobs = (r.json() or {}).get("jobs", [])
            for job in jobs:
                log(f"→ {job['kind']} {str(job.get('payload'))[:60]}")
                res = execute(job)
                ok, out = res[0], res[1]
                attachment = res[2] if len(res) > 2 else None
                body = {"action": "result", "nodeId": cfg["nodeId"], "token": cfg["token"],
                        "jobId": job["id"], "ok": ok, "output": out}
                if attachment:
                    body["attachment"] = attachment
                requests.post(f"{server}/api/node", json=body, timeout=30)
                log(f"  {'OK' if ok else 'ERREUR'} : {str(out)[:80]}")
            time.sleep(POLL_SECONDS)
        except KeyboardInterrupt:
            log("Arrêt de l'agent.")
            break
        except requests.exceptions.ConnectionError:
            log("Cerveau injoignable — nouvelle tentative dans 10 s.")
            time.sleep(10)
        except Exception as e:
            log(f"Erreur : {e}")
            time.sleep(5)

if __name__ == "__main__":
    main()
