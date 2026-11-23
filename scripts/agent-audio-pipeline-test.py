#!/usr/bin/env python3
"""Test d'integration du micro de l'agent, sans micro physique.

Le test simule :
  flux 1 = attente openWakeWord ;
  fermeture complete du flux 1 ;
  confirmation vocale synchrone ;
  flux 2 = bruit, commande parlee, silence ;
  transcription Google simulee ;
  envoi de la commande a Jarvis ;
  rearmement du mot-cle.

Echoue si deux flux micro sont ouverts simultanement.
"""

import importlib.util
import os
import sys
import types
import numpy as np

AGENT = os.path.join(os.path.dirname(__file__), "..", "public", "jarvis-node", "jarvis-agent.py")

# ---------- Micro sounddevice simule ----------
active_streams = 0
max_active_streams = 0
stream_number = 0
events = []


def frame(level: int, n: int):
    # Signal carre deterministic : RMS = level
    a = np.empty((n, 1), dtype=np.int16)
    a[0::2] = level
    a[1::2] = -level
    return a


class FakeStream:
    def __init__(self, kind, blocksize):
        self.kind = kind
        self.blocksize = blocksize
        self.i = 0

    def __enter__(self):
        global active_streams, max_active_streams
        active_streams += 1
        max_active_streams = max(max_active_streams, active_streams)
        events.append(f"open:{self.kind}")
        if active_streams > 1:
            raise AssertionError("Deux micros ouverts simultanement")
        return self

    def __exit__(self, *args):
        global active_streams
        active_streams -= 1
        events.append(f"close:{self.kind}")
        return False

    def read(self, n):
        self.i += 1
        if self.kind == "wake":
            # Le modele fake detecte la toute premiere trame.
            return frame(900, n), False
        if self.kind == "command":
            # 4 trames de calibration, 6 de parole, puis 10 de silence.
            if self.i <= 4:
                return frame(45, n), False
            if self.i <= 10:
                return frame(1100, n), False
            return frame(30, n), False
        raise KeyboardInterrupt


def input_stream(**kwargs):
    global stream_number
    stream_number += 1
    if stream_number == 1:
        return FakeStream("wake", kwargs["blocksize"])
    if stream_number == 2:
        return FakeStream("command", kwargs["blocksize"])
    # Au rearmement, on termine proprement le test.
    return FakeStream("stop", kwargs["blocksize"])


sd = types.ModuleType("sounddevice")
sd.InputStream = input_stream
sys.modules["sounddevice"] = sd

# ---------- SpeechRecognition simule ----------
sr = types.ModuleType("speech_recognition")


class AudioData:
    def __init__(self, data, sample_rate, sample_width):
        self.data = data
        self.sample_rate = sample_rate
        self.sample_width = sample_width


class UnknownValueError(Exception):
    pass


class RequestError(Exception):
    pass


class Recognizer:
    def recognize_google(self, audio, language="fr-FR"):
        assert audio.sample_rate == 16000
        assert len(audio.data) > 1000
        events.append("transcribed")
        return "ouvre Word sur mon PC"

    def recognize_vosk(self, audio):
        return '{"text":""}'


sr.AudioData = AudioData
sr.Recognizer = Recognizer
sr.UnknownValueError = UnknownValueError
sr.RequestError = RequestError
sys.modules["speech_recognition"] = sr

# ---------- Chargement de l'agent ----------
spec = importlib.util.spec_from_file_location("jarvis_agent", AGENT)
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)
agent.ARGS = types.SimpleNamespace(daemon=True)


class FakeModel:
    def predict(self, audio):
        return {"hey_jarvis": 0.95}

    def reset(self):
        events.append("model-reset")


agent._load_wake_model = lambda threshold: FakeModel()
agent.open_jarvis_ui = lambda server, reason="wake": (True, "Jarvis.exe")

spoken = []


def fake_speak(text, wait=False):
    spoken.append((text, wait))
    events.append(f"speak:{'wait' if wait else 'async'}")
    return True


agent.speak_local = fake_speak
received = []
agent.push_command_to_jarvis = lambda server, text: received.append(text) or True

# ---------- Execution ----------
agent.wake_listener("http://127.0.0.1:3210", threshold=0.08, cooldown=0)

expected_order = ["open:wake", "close:wake", "speak:wait", "open:command", "close:command", "transcribed"]
position = 0
for event in events:
    if position < len(expected_order) and event == expected_order[position]:
        position += 1

print("evenements :", " -> ".join(events))
print("micro simultane max :", max_active_streams)
print("confirmation synchrone :", spoken)
print("commande transmise :", received)
print("etat final :", agent.WAKE_STATE)

assert max_active_streams == 1, "Deux flux micro ont ete ouverts en meme temps"
assert position == len(expected_order), f"Ordre audio incorrect ({position}/{len(expected_order)})"
assert spoken and spoken[0] == ("Oui, je vous ecoute.", True)
assert received == ["ouvre Word sur mon PC"]
assert stream_number >= 3, "Le wake word n'a pas ete rearme"

print("\nOK : wake word -> fermeture micro -> dictee -> commande -> rearmement")

# ---------- Mode mains libres SANS mot-cle ----------
direct_received = []
direct_opened = []
answers = iter([
    ("ouvre la calculatrice", "google"),
])


def fake_direct_transcribe(*args, **kwargs):
    try:
        return next(answers)
    except StopIteration:
        raise KeyboardInterrupt


agent.transcribe_after_wake = fake_direct_transcribe
agent.push_command_to_jarvis = lambda server, text: direct_received.append(text) or True
agent.open_jarvis_ui = lambda server, reason="voice": direct_opened.append(reason) or (True, "Jarvis.exe")
agent.continuous_listener("http://127.0.0.1:3210")

print("mode direct - commandes :", direct_received)
print("mode direct - fenetre :", direct_opened)
assert direct_received == ["ouvre la calculatrice"]
assert direct_opened == ["voice"]
print("OK : phrase directe -> commande, aucun mot-cle requis")
