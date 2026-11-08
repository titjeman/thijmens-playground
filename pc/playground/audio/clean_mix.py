# Thijmens Playground: "clean" (classroom-safe) version of a finished episode.
# Picture, music and SFX stay exactly the same; only the swear words in the voice stem are replaced by a short
# bleep (or silence), timed with words.json. Mastered like warp_mix.py (-14 LUFS, <= -1.2 dBTP).
#
#   python clean_mix.py <workdir> [--mode bleep|mute]
#   workdir holds stem_voice.wav, stem_music.wav, stem_sfx.wav (written by warp_mix.py) and words.json.
#   Writes mix_clean.wav + clean_report.json in workdir. Mux with final.mp4's picture afterwards (see PLAYGROUND-RENDER.md).
import argparse
import json
import os
import re
import sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dsp import SR, ns, dbg, read_wav, write_wav, true_peak  # noqa: E402
import mix as MX  # noqa: E402

TARGET_LUFS = -14.0
BAD = re.compile(r"^(fuck\w*|motherfuck\w*|shit\w*|bullshit|damn\w*|goddamn\w*|bitch\w*|ass|asshole\w*|bastard\w*|crap\w*|hell)$", re.I)
PRE, POST, XF = 0.025, 0.035, 0.008  # seconds around the word, crossfade


def spans(words):
    out = []
    for w in words:
        t = re.sub(r"[^\w'-]", "", w.get("w", ""))
        if BAD.match(t):
            out.append((float(w.get("s", w.get("start"))), float(w.get("e", w.get("end"))), t))
    return out


def clean_voice(v, sp, mode):
    v = v.copy()
    n = v.shape[1]
    for s, e, _ in sp:
        a, b = max(0, ns(s - PRE)), min(n, ns(e + POST))
        if b <= a:
            continue
        k = min(ns(XF), (b - a) // 4)
        ref_a, ref_b = max(0, ns(s - 1.0)), min(n, ns(e + 1.0))
        rms = np.sqrt(np.mean(v[:, ref_a:ref_b] ** 2)) + 1e-9
        env = np.ones(b - a)
        env[:k] = np.linspace(1, 0, k)
        env[-k:] = np.linspace(0, 1, k)
        mid = np.zeros(b - a)
        mid[:k] = 1 - env[:k]
        mid[-k:] = 1 - env[-k:]
        mid[k:-k] = 1.0
        v[:, a:b] *= (1 - mid)[None, :]
        if mode == "bleep":
            t = np.arange(b - a) / SR
            tone = np.sin(2 * np.pi * 1000.0 * t) * rms * np.sqrt(2) * dbg(-3.0)
            v[:, a:b] += (tone * mid)[None, :]
    return v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("work")
    ap.add_argument("--mode", choices=["bleep", "mute"], default="bleep")
    a = ap.parse_args()
    words = json.load(open(os.path.join(a.work, "words.json"), encoding="utf-8"))
    sp = spans(words)
    v, sr = read_wav(os.path.join(a.work, "stem_voice.wav"))
    m, _ = read_wav(os.path.join(a.work, "stem_music.wav"))
    s, _ = read_wav(os.path.join(a.work, "stem_sfx.wav"))
    assert sr == SR
    n = min(v.shape[1], m.shape[1], s.shape[1])
    v, m, s = v[:, :n], m[:, :n], s[:, :n]
    vc = clean_voice(v, sp, a.mode)
    mix0 = vc + m + s
    G = TARGET_LUFS - MX.lufs(mix0)
    for _ in range(6):
        y, _g = MX.limiter(mix0 * dbg(G))
        L = MX.lufs(y)
        if abs(L - TARGET_LUFS) < 0.03:
            break
        G += TARGET_LUFS - L
    write_wav(os.path.join(a.work, "mix_clean.wav"), y)
    rep = {"mode": a.mode, "replaced": [{"word": w, "s": round(s0, 2), "e": round(e0, 2)} for s0, e0, w in sp],
           "lufs": round(MX.lufs(y), 2), "true_peak": round(true_peak(y), 2), "seconds": round(n / SR, 3)}
    json.dump(rep, open(os.path.join(a.work, "clean_report.json"), "w"), indent=1)
    print(json.dumps(rep))


if __name__ == "__main__":
    main()
