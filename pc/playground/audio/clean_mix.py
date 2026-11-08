# Thijmens Playground: "clean" (classroom-safe) version of a finished episode.
# Picture, music and SFX stay exactly the same. In the voice stem every swear word is CUT OUT (default): the rest of
# that one sentence is time-stretched a few percent (pitch kept) so the sentence keeps its exact length and the
# picture stays in sync. "two fucking feet deep" becomes "two feet deep". Mastered like warp_mix.py (-14 LUFS).
#
#   python clean_mix.py <workdir> [--mode cut|bleep|mute]
#   workdir holds stem_voice.wav, stem_music.wav, stem_sfx.wav (written by warp_mix.py) and words.json.
#   Writes mix_clean.wav + clean_report.json in workdir. Mux with final.mp4's picture afterwards (see PLAYGROUND-RENDER.md).
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dsp import SR, ns, dbg, read_wav, write_wav, true_peak  # noqa: E402
import mix as MX  # noqa: E402

TARGET_LUFS = -14.0
BAD = re.compile(r"^(fuck\w*|motherfuck\w*|shit\w*|bullshit|damn\w*|goddamn\w*|bitch\w*|ass|asshole\w*|bastard\w*|crap\w*|hell)$", re.I)
PRE, POST, XF = 0.025, 0.035, 0.008  # seconds around the word, crossfade (bleep/mute)
MAX_STRETCH = 1.12                     # cut mode: never slow a sentence down more than 12 %; the rest becomes pause
try:
    from warp_mix import FF as _FF     # the full ffmpeg build with rubberband on Thijmen's pc
except Exception:
    _FF = "ffmpeg"
FF = os.environ.get("FFMPEG") or (_FF if os.path.exists(_FF) else "ffmpeg")


def _t(w, k):
    return float(w.get(k[0], w.get(k)))


def bad_idx(words):
    return [i for i, w in enumerate(words) if BAD.match(re.sub(r"[^\w'-]", "", w.get("w", "")))]


def spans(words):
    return [(_t(words[i], "start"), _t(words[i], "end"), re.sub(r"[^\w'-]", "", words[i]["w"])) for i in bad_idx(words)]


def quiet_point(v, t, win=0.04, hop=0.005):
    """the quietest 5 ms point within +-win of t (so a cut never clips a neighbouring word)"""
    m = v.mean(0)
    best, bt = None, t
    for k in np.arange(-win, win + 1e-9, hop):
        a = ns(t + k)
        if a < 0 or a + ns(hop) > len(m):
            continue
        e = float(np.mean(m[a:a + ns(hop)] ** 2))
        if best is None or e < best:
            best, bt = e, t + k
    return bt


def stretch(x, ratio):
    """time-stretch stereo x to ratio * its length, pitch kept (ffmpeg rubberband)"""
    tmp = tempfile.mkdtemp(dir=os.environ.get("TEMP"))
    a, b = os.path.join(tmp, "a.wav"), os.path.join(tmp, "b.wav")
    write_wav(a, x)
    subprocess.run([FF, "-y", "-loglevel", "error", "-i", a, "-af", f"rubberband=tempo={1 / ratio:.6f}:transients=smooth",
                    "-ar", str(SR), "-c:a", "pcm_s24le", b], check=True)
    y, _ = read_wav(b)
    return y


def xcat(parts, k):
    out = parts[0]
    for p in parts[1:]:
        kk = min(k, out.shape[1], p.shape[1])
        if kk < 2:
            out = np.concatenate([out, p], 1)
            continue
        f = np.linspace(0, 1, kk)[None, :]
        out = np.concatenate([out[:, :-kk], out[:, -kk:] * (1 - f) + p[:, :kk] * f, p[:, kk:]], 1)
    return out


def cut_voice(v, words):
    """remove every swear word; keep each affected sentence exactly as long as before"""
    v = v.copy()
    n, k = v.shape[1], ns(0.006)
    idx = bad_idx(words)
    end_of = lambda i: words[i]["w"].rstrip().endswith((".", "!", "?"))
    sentences = {}
    for i in idx:
        a = i
        while a > 0 and not end_of(a - 1):
            a -= 1
        b = i
        while b < len(words) - 1 and not end_of(b):
            b += 1
        sentences.setdefault((a, b), []).append(i)
    report = []
    for (a, b), bad in sentences.items():
        S, E = _t(words[a], "start"), _t(words[b], "end")
        cuts = []
        for i in bad:
            c0 = quiet_point(v, _t(words[i], "start"))
            c1 = quiet_point(v, _t(words[i + 1], "start") if i < b else _t(words[i], "end"))
            cuts.append((max(S, c0), min(E, c1)))
        keep, t = [], S
        for c0, c1 in sorted(cuts):
            if c0 > t:
                keep.append(v[:, ns(t):ns(c0)])
            t = max(t, c1)
        keep.append(v[:, ns(t):ns(E)])
        kept = xcat(keep, k)
        L = ns(E) - ns(S)
        ratio = min(MAX_STRETCH, L / max(1, kept.shape[1]))
        y = stretch(kept, ratio)
        y = y[:, :L] if y.shape[1] >= L else np.concatenate([y, np.zeros((2, L - y.shape[1]))], 1)
        f = min(ns(0.01), L // 4)
        ramp = np.ones(L)
        ramp[:f] = np.linspace(0, 1, f)
        ramp[-f:] = np.linspace(1, 0, f)
        seg = v[:, ns(S):ns(S) + L]
        v[:, ns(S):ns(S) + L] = seg * (1 - ramp)[None, :] + y * ramp[None, :]
        report.append({"sentence": " ".join(w["w"] for w in words[a:b + 1]), "removed": [words[i]["w"] for i in bad],
                       "stretch": round(L / max(1, kept.shape[1]), 3), "applied": round(ratio, 3)})
    return v, report


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
    ap.add_argument("--mode", choices=["cut", "bleep", "mute"], default="cut")
    a = ap.parse_args()
    words = json.load(open(os.path.join(a.work, "words.json"), encoding="utf-8"))
    sp = spans(words)
    v, sr = read_wav(os.path.join(a.work, "stem_voice.wav"))
    m, _ = read_wav(os.path.join(a.work, "stem_music.wav"))
    s, _ = read_wav(os.path.join(a.work, "stem_sfx.wav"))
    assert sr == SR
    n = min(v.shape[1], m.shape[1], s.shape[1])
    v, m, s = v[:, :n], m[:, :n], s[:, :n]
    sentences = []
    if a.mode == "cut":
        vc, sentences = cut_voice(v, words)
    else:
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
           "sentences": sentences, "lufs": round(MX.lufs(y), 2), "true_peak": round(true_peak(y), 2), "seconds": round(n / SR, 3)}
    json.dump(rep, open(os.path.join(a.work, "clean_report.json"), "w"), indent=1)
    print(json.dumps(rep))


if __name__ == "__main__":
    main()
