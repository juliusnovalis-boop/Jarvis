#!/usr/bin/env python3
"""Tests sans Windows physique des contrats de contrôle PC de l'agent."""
import importlib.util
import os
import sys
import tempfile
import types
from pathlib import Path

AGENT = Path(__file__).resolve().parents[1] / "public" / "jarvis-node" / "jarvis-agent.py"
spec = importlib.util.spec_from_file_location("agent_control_test", AGENT)
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)
agent.ARGS = types.SimpleNamespace(daemon=True, unsafe=False)

# ---------- PyAutoGUI simulé ----------
class FakePyAutoGUI:
    FAILSAFE = True
    PAUSE = 0.0
    def __init__(self):
        self.calls = []
        self.pos = (100, 100)
    def size(self): return (1920, 1080)
    def position(self): return self.pos
    def moveTo(self, x, y, duration=0): self.pos=(x,y); self.calls.append(("moveTo",x,y))
    def moveRel(self, dx, dy, duration=0): self.pos=(self.pos[0]+dx,self.pos[1]+dy); self.calls.append(("moveRel",dx,dy))
    def click(self, **kw): self.calls.append(("click",kw))
    def typewrite(self, text, interval=0): self.calls.append(("type",text))
    def hotkey(self, *keys): self.calls.append(("hotkey",)+keys)
    def press(self, key): self.calls.append(("press",key))

pg=FakePyAutoGUI()
pgmod=types.ModuleType("pyautogui")
for name in dir(pg):
    if not name.startswith("_"): setattr(pgmod,name,getattr(pg,name))
sys.modules["pyautogui"]=pgmod
agent.pyautogui=pg
agent.HAS_GUI=True

assert agent.execute({"kind":"mouse_move","payload":{"dx":350,"dy":-40}})[0]
assert agent.execute({"kind":"mouse_click","payload":{"button":"left","clicks":2}})[0]
assert agent.execute({"kind":"type","payload":{"text":"Bonjour maman"}})[0]
ok, detail, _ = agent.execute({"kind":"macro","payload":{"steps":[
    {"do":"key","keys":["ctrl","n"]},
    {"do":"type","text":"Texte de test"},
    {"do":"press","key":"enter"},
]}})
assert ok, detail
print("souris/clavier : OK",pg.calls)

# ---------- Application inconnue via menu Demarrer ----------
root=Path(tempfile.mkdtemp())
programs=root/"Microsoft"/"Windows"/"Start Menu"/"Programs"
programs.mkdir(parents=True)
shortcut=programs/"Proton Mail.lnk"; shortcut.write_bytes(b"fake-lnk")
os.environ["APPDATA"]=str(root)
os.environ["ProgramData"]=str(root/"none")
opened=[]
setattr(os,"startfile",lambda p: opened.append(str(p)))
old_system=agent.platform.system
agent.platform.system=lambda:"Windows"
ok,msg=agent.launch_windows_app("Proton Mail")
assert ok and opened and opened[0].endswith("Proton Mail.lnk"),(ok,msg,opened)
print("application quelconque via menu Demarrer : OK",msg)

# ---------- Word COM simulé ----------
class Content:
    Text=""
class Document:
    def __init__(self): self.Content=Content(); self.closed=False
    def SaveAs2(self,path,FileFormat=16):
        Path(path).write_bytes(("DOCX:"+self.Content.Text).encode("utf-8"))
    def Close(self,SaveChanges=False): self.closed=True
class Documents:
    def __init__(self): self.last=None
    def Add(self): self.last=Document(); return self.last
    def Open(self,path): return path
class Word:
    def __init__(self): self.Visible=False; self.DisplayAlerts=1; self.Documents=Documents(); self.quit=False
    def Quit(self): self.quit=True
word=Word()
client=types.ModuleType("win32com.client"); client.DispatchEx=lambda progid: word
win32com=types.ModuleType("win32com"); win32com.client=client
sys.modules["win32com"]=win32com; sys.modules["win32com.client"]=client
home=root/"home"; (home/"Documents").mkdir(parents=True)
old_expanduser=agent.os.path.expanduser
agent.os.path.expanduser=lambda p: str(home) if p=="~" else old_expanduser(p)
ok,msg=agent.create_word_document("Maman est partie","file",close=True,reopen=False)
expected=home/"Documents"/"file.docx"
assert ok,(ok,msg)
assert expected.exists(),expected
assert expected.read_bytes()=="DOCX:Maman est partie".encode("utf-8")
assert word.Documents.last.closed and word.quit
print("Word COM : OK",msg)

agent.platform.system=old_system
print("\nOK : contrôle PC, logiciel quelconque et Word natif validés")
