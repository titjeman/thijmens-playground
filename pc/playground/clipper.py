"""Thijmens Playground - clipper.

Gebruik (Windows, vanuit C:\\Users\\thijm\\my-video):
  python playground/clipper.py prepare <jobmap>   download + transcriptie + kandidaten
  python playground/clipper.py cut <jobmap>       knipt de momenten uit cuts.json naar 9:16-clips

<jobmap> is een map met clipjob.json (zie PLAYGROUND-CLIPS.md).
Werkbestanden: F:\\temp\\Playground\\work\\<code>\\ ; resultaat: F:\\temp\\Playground\\videos\\<code>\\
"""
import json, math, os, shutil, subprocess, sys, wave, struct
from pathlib import Path

ROOT = Path(os.environ.get("PLAYGROUND_ROOT", r"F:\temp\Playground"))
W, H = 1080, 1920


def run(cmd, **kw):
    print("+", " ".join(str(c) for c in cmd), flush=True)
    return subprocess.run([str(c) for c in cmd], check=True, **kw)


def hms(t):
    t = max(0.0, float(t)); h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"


def secs(v, default=None):
    if v is None or v == "":
        return default
    if isinstance(v, (int, float)):
        return float(v)
    parts = [float(p) for p in str(v).split(":")]
    while len(parts) < 3:
        parts.insert(0, 0.0)
    return parts[0] * 3600 + parts[1] * 60 + parts[2]


def load_job(jobdir):
    job = json.loads((Path(jobdir) / "clipjob.json").read_text(encoding="utf-8"))
    code = job.get("code") or Path(jobdir).name
    work = ROOT / "work" / code; out = ROOT / "videos" / code
    work.mkdir(parents=True, exist_ok=True); out.mkdir(parents=True, exist_ok=True)
    return job, code, work, out


# ---------------- prepare ----------------
def download(src, i, work):
    dst = work / f"src{i}.mp4"
    if dst.exists() and dst.stat().st_size > 0:
        return dst
    if src.get("file"):  # lokaal bestand (bijv. eigen opname)
        shutil.copy(src["file"], dst); return dst
    start = secs(src.get("start"), 0.0); end = secs(src.get("end"), start + 3600)
    end = min(end, start + 5400)  # max 90 min per bron
    tmpl = str(work / f"src{i}.%(ext)s")
    run([sys.executable, "-m", "yt_dlp", "-f", "bv*[height<=1080]+ba/b[height<=1080]/b",
         "--download-sections", f"*{hms(start)}-{hms(end)}", "--force-keyframes-at-cuts",
         "--merge-output-format", "mp4", "-o", tmpl, src["url"]])
    if not dst.exists():
        cands = sorted(work.glob(f"src{i}.*"))
        if not cands:
            raise RuntimeError(f"download mislukt: {src['url']}")
        cands[0].rename(dst)
    return dst


def extract_wav(video, wav):
    if not wav.exists():
        run(["ffmpeg", "-y", "-v", "error", "-i", video, "-vn", "-ac", "1", "-ar", "16000", wav])


def transcribe(wav, words_path, language=None):
    if words_path.exists():
        return json.loads(words_path.read_text(encoding="utf-8"))
    from faster_whisper import WhisperModel
    try:
        model = WhisperModel("small", device="cuda", compute_type="float16")
    except Exception:
        model = WhisperModel("small", device="cpu", compute_type="int8")
    segs, _ = model.transcribe(str(wav), language=language, word_timestamps=True, vad_filter=True)
    words = [{"w": w.word.strip(), "s": round(w.start, 2), "e": round(w.end, 2)} for s in segs for w in (s.words or [])]
    words_path.write_text(json.dumps(words), encoding="utf-8")
    return words


def loudness(wav):
    """RMS (dB) per seconde."""
    with wave.open(str(wav)) as f:
        sr = f.getframerate(); n = f.getnframes(); out = []
        for _ in range(int(n // sr)):
            buf = f.readframes(sr)
            vals = struct.unpack(f"<{len(buf)//2}h", buf)
            rms = math.sqrt(sum(v * v for v in vals) / max(1, len(vals)))
            out.append(20 * math.log10(rms + 1))
    return out


HYPE = {"bro", "what", "no", "yo", "oh", "wait", "omg", "insane", "crazy", "bruh", "lmao", "run", "chat", "dude", "holy"}


def candidates(words, loud, top=15, length=40):
    n = len(loud)
    if n == 0:
        return []
    mean = sum(loud) / n; sd = math.sqrt(sum((x - mean) ** 2 for x in loud) / n) or 1
    rate = [0] * n; hype = [0] * n
    for w in words:
        k = int(w["s"])
        if 0 <= k < n:
            rate[k] += 1
            if w["w"].lower().strip(".,!?") in HYPE or "!" in w["w"]:
                hype[k] += 1
    score = []
    for k in range(n):
        lo = max(0, k - 2); hi = min(n, k + 3)
        z = max((loud[j] - mean) / sd for j in range(lo, hi))
        score.append(z + 0.15 * sum(rate[lo:hi]) + 0.6 * sum(hype[lo:hi]))
    picked = []
    for k in sorted(range(n), key=lambda i: -score[i]):
        if all(abs(k - p) > length for p in picked):
            picked.append(k)
        if len(picked) >= top:
            break
    res = []
    for k in sorted(picked):
        s = max(0, k - int(length * 0.6)); e = min(n, s + length)
        text = " ".join(w["w"] for w in words if s <= w["s"] < e)
        res.append({"peak": k, "start": s, "end": e, "score": round(score[k], 2), "text": text[:900]})
    return res


def prepare(jobdir):
    job, code, work, out = load_job(jobdir)
    allc = []
    for i, src in enumerate(job.get("sources", [])):
        v = download(src, i, work)
        wav = work / f"src{i}.wav"; extract_wav(v, wav)
        words = transcribe(wav, work / f"words{i}.json", src.get("language"))
        for c in candidates(words, loudness(wav)):
            c["source"] = i; allc.append(c)
    allc.sort(key=lambda c: -c["score"])
    (work / "candidates.json").write_text(json.dumps(allc, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"{len(allc)} kandidaten -> {work / 'candidates.json'}")


# ---------------- cut ----------------
def ass_time(t):
    t = max(0, t); return f"{int(t//3600)}:{int(t%3600//60):02d}:{t%60:05.2f}"


def esc_ass(s):
    return s.replace("\\", "").replace("{", "(").replace("}", ")").replace("\n", " ")


def write_ass(path, words, start, end, hook):
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Arial Black,92,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,7,3,5,60,60,0,1
Style: Hook,Arial Black,70,&H0000E5FF,&H00FFFFFF,&H00000000,&H96000000,1,0,0,0,100,100,0,0,3,6,0,8,60,60,150,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = []
    if hook:
        lines.append(f"Dialogue: 1,{ass_time(0)},{ass_time(min(3.2, end-start))},Hook,,0,0,0,,{esc_ass(hook.upper())}")
    ws = [w for w in words if start <= w["s"] < end]
    for k in range(0, len(ws), 3):
        chunk = ws[k:k + 3]
        s = chunk[0]["s"] - start; e = (ws[k + 3]["s"] if k + 3 < len(ws) else chunk[-1]["e"] + 0.3) - start
        txt = " ".join(esc_ass(w["w"]) for w in chunk).upper()
        lines.append(f"Dialogue: 0,{ass_time(s)},{ass_time(min(e, s + 2.5))},Cap,,0,0,0,,{{\\pos({W//2},{int(H*0.70)})}}{txt}")
    Path(path).write_text(head + "\n".join(lines) + "\n", encoding="utf-8")


def filter_graph(layout, fc, ass_name):
    if layout == "facecam-top" and fc:
        x, y, w, h = fc["x"], fc["y"], fc["w"], fc["h"]
        ch = 692; gh = H - ch
        g = (f"[0:v]crop=iw*{w}:ih*{h}:iw*{x}:ih*{y},scale={W}:{ch}:force_original_aspect_ratio=increase,crop={W}:{ch}[cam];"
             f"[0:v]scale=-2:{gh},crop={W}:{gh}[game];"
             f"[cam][game]vstack=inputs=2,setsar=1[v0]")
    else:
        g = (f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=28:2,eq=brightness=-0.08[bg];"
             f"[0:v]scale={W}*1.35:-2,crop={W}:ih[fg];"
             f"[bg][fg]overlay=(W-w)/2:(H-h)/2-40,setsar=1[v0]")
    return g + f";[v0]ass={ass_name}[v]"


def cut(jobdir):
    job, code, work, out = load_job(jobdir)
    cuts = json.loads((work / "cuts.json").read_text(encoding="utf-8"))
    srcs = job.get("sources", []); made = []
    for n, c in enumerate(cuts, 1):
        i = int(c.get("source", 0)); src = srcs[i] if i < len(srcs) else {}
        words = json.loads((work / f"words{i}.json").read_text(encoding="utf-8")) if (work / f"words{i}.json").exists() else []
        s, e = float(c["start"]), float(c["end"])
        e = min(e, s + float(job.get("maxSeconds", 59)))
        ass = f"clip{n:02d}.ass"; write_ass(work / ass, words, s, e, c.get("hook", ""))
        name = f"clip-{n:02d}.mp4"
        tmp = work / f"_tmp_{name}"
        run(["ffmpeg", "-y", "-v", "error", "-ss", f"{s:.2f}", "-t", f"{e-s:.2f}", "-i", work / f"src{i}.mp4",
             "-filter_complex", filter_graph(src.get("layout", "gameplay"), src.get("facecam"), ass),
             "-map", "[v]", "-map", "0:a:0?", "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-pix_fmt", "yuv420p",
             "-r", "30", "-c:a", "aac", "-b:a", "160k", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-movflags", "+faststart", tmp.name],
            cwd=work)
        shutil.move(str(tmp), str(out / name))
        prev = out / f"preview-{n:02d}.mp4"
        run(["ffmpeg", "-y", "-v", "error", "-i", out / name, "-vf", "scale=540:960", "-c:v", "libx264", "-crf", "30",
             "-preset", "veryfast", "-c:a", "aac", "-b:a", "64k", prev])
        made.append({"file": name, "preview": prev.name, "start": s, "end": e, "seconds": round(e - s, 1),
                     "hook": c.get("hook", ""), "caption": c.get("caption", ""), "hashtags": c.get("hashtags", []),
                     "source": src.get("url") or src.get("file", ""), "streamer": src.get("label", "")})
    from datetime import datetime, timezone
    done = {"id": job.get("id"), "code": code, "kind": "clips", "clips": made,
            "renderedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "qa": "ok"}
    (out / "done.json").write_text(json.dumps(done, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"{len(made)} clips -> {out}")


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("prepare", "cut"):
        print(__doc__); sys.exit(1)
    (prepare if sys.argv[1] == "prepare" else cut)(sys.argv[2])
