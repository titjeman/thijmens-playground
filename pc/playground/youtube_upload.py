#!/usr/bin/env python3
"""Thijmens Playground: zet afgeronde shorts op YouTube via de officiele YouTube Data API v3.

Kost GEEN Claude-tegoed: dit is gewone Python, gestart door de Taakplanner (run-upload.ps1).
Geheimen (client_secret.json, youtube_token.json) staan alleen op de pc in F:\\temp\\Playground\\secrets.

Commando's:
  python youtube_upload.py auth                 eenmalig inloggen, toont je kanaalnaam
  python youtube_upload.py status               wat staat klaar / wat is al geupload (geen API)
  python youtube_upload.py upload --dry-run     laat zien wat hij zou doen, uploadt niets
  python youtube_upload.py upload               upload de oudste klare video (max 1 per run)

Een video wordt alleen geupload als in F:\\temp\\Playground\\videos\\<code>\\ staat:
  done.json met "qa": "ok", final.mp4 en platform-texts.md, en GEEN youtube.json, error.txt of skip-upload.txt.
Wil je een video tegenhouden: zet een leeg bestand skip-upload.txt in de map.

Hij uploadt als 'private' met publishAt = eerstvolgende vrije dag om 17:00 (Amsterdam), zodat je tot dan
kunt kijken en ingrijpen in YouTube Studio. De schone docentenversie gaat als 'unlisted' (niet-openbaar).
"""
import argparse
import datetime as dt
import json
import os
import random
import re
import sys
import time
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(os.environ.get("PLAYGROUND_ROOT", r"F:\temp\Playground"))
VIDEOS = ROOT / "videos"
SECRETS = ROOT / "secrets"
LOGS = ROOT / "logs"
CLIENT_SECRET = SECRETS / "client_secret.json"
TOKEN = SECRETS / "youtube_token.json"
SCOPES = ["https://www.googleapis.com/auth/youtube.upload",
          "https://www.googleapis.com/auth/youtube.readonly"]
TZ = ZoneInfo("Europe/Amsterdam")
CATEGORY_EDUCATION = "27"
PROFANITY = re.compile(r"f+u+c+k|sh[i1]t|bitch|cunt", re.I)


# ---------------------------------------------------------------- platform-texts.md lezen
KEY_RE = re.compile(
    r"^\s*(?:[-*]\s*)?(?:\*\*|__)?\s*(title|titel|caption|description|beschrijving|hashtags|tags)\s*(?:\*\*|__)?\s*[:\uff1a]\s*(?:\*\*|__)?\s*(.*)$",
    re.I)
HEADING_RE = re.compile(r"^\s*(#{1,6}\s+.+|\*\*[^*]+\*\*\s*:?\s*)$")


def _youtube_section(text: str) -> str:
    """Pak het stuk onder een kop met 'YouTube' erin; anders de hele tekst."""
    lines = text.splitlines()
    start = None
    for i, line in enumerate(lines):
        if HEADING_RE.match(line) and "youtube" in line.lower() and not KEY_RE.match(line):
            start = i + 1
            continue
        if start is not None and HEADING_RE.match(line) and not KEY_RE.match(line):
            return "\n".join(lines[start:i])
    return "\n".join(lines[start:]) if start is not None else text


def parse_platform_texts(text: str) -> dict:
    section = _youtube_section(text)
    fields, key = {}, None
    for line in section.splitlines():
        m = KEY_RE.match(line)
        if m:
            k = m.group(1).lower()
            key = {"titel": "title", "caption": "title", "beschrijving": "description", "tags": "hashtags"}.get(k, k)
            if key == "title" and "title" in fields:  # caption naast title: caption telt als beschrijving
                key = "description"
            fields[key] = [m.group(2).strip()]
        elif key and line.strip():
            fields[key].append(line.strip())
        elif key and not line.strip() and key != "description":
            key = None
    out = {k: "\n".join(v).strip().strip('"').strip() for k, v in fields.items()}
    tags = re.findall(r"#(\w+)", out.get("hashtags", "") + " " + out.get("description", ""))
    out["hashtags"] = list(dict.fromkeys(tags))  # uniek, volgorde behouden
    return out


def build_metadata(folder: Path) -> dict:
    texts = parse_platform_texts((folder / "platform-texts.md").read_text(encoding="utf-8"))
    title = re.sub(r"[<>]", "", texts.get("title", "")).strip()
    if not title:
        raise ValueError("geen YouTube-titel gevonden in platform-texts.md")
    tags = texts["hashtags"]
    if not any(t.lower() == "shorts" for t in tags):
        tags.append("Shorts")
    desc = re.sub(r"(?m)^\s*#\w+(\s+#\w+)*\s*$", "", texts.get("description", "")).strip()  # losse hashtagregels eruit
    desc = re.sub(r"[<>]", "", desc)
    description = (desc + "\n\n" + " ".join("#" + t for t in tags)).strip()
    # YouTube: tags samen max 500 tekens
    yt_tags, total = [], 0
    for t in tags:
        if total + len(t) + 1 > 480:
            break
        yt_tags.append(t)
        total += len(t) + 1
    meta = {"title": title[:100], "description": description[:5000], "tags": yt_tags}
    bad = PROFANITY.search(meta["title"] + " " + meta["description"] + " " + " ".join(yt_tags))
    if bad:
        raise ValueError(f"vloek '{bad.group(0)}' in titel/beschrijving/tags; serie-regel: nooit in platformteksten")
    return meta


# ---------------------------------------------------------------- welke video's staan klaar
def load_json(p: Path):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def folder_state(folder: Path) -> str:
    if (folder / "youtube.json").exists() and (load_json(folder / "youtube.json") or {}).get("videoId"):
        return "geupload"
    if (folder / "skip-upload.txt").exists():
        return "tegengehouden (skip-upload.txt)"
    if (folder / "error.txt").exists():
        return "render-fout (error.txt)"
    done = load_json(folder / "done.json")
    if not done:
        return "nog niet gerenderd (geen done.json)"
    if not str(done.get("qa", "")).lower().startswith("ok"):
        return f"QA niet ok: {done.get('qa')}"
    if not (folder / "final.mp4").exists():
        return "final.mp4 ontbreekt"
    if not (folder / "platform-texts.md").exists():
        return "platform-texts.md ontbreekt"
    if (folder / "upload_error.txt").exists():
        return "upload-fout (upload_error.txt, haal weg om opnieuw te proberen)"
    return "klaar"


def video_folders():
    if not VIDEOS.exists():
        return []
    # clip-mappen (clip-01.mp4) horen bij de clipjagers, niet bij het kanaal
    folders = [f for f in VIDEOS.iterdir() if f.is_dir() and not list(f.glob("clip-*.mp4"))]
    def key(f):
        d = load_json(f / "done.json") or {}
        return (d.get("renderedAt") or "", f.name)
    return sorted(folders, key=key)


# ---------------------------------------------------------------- publicatietijd
def next_slot(publish_time: str, now_utc: dt.datetime) -> dt.datetime:
    hh, mm = map(int, publish_time.split(":"))
    taken = set()
    for f in video_folders():
        y = load_json(f / "youtube.json") or {}
        if y.get("publishAt"):
            taken.add(dt.datetime.fromisoformat(y["publishAt"].replace("Z", "+00:00")).astimezone(TZ).date())
    day = now_utc.astimezone(TZ).date()
    while True:
        slot = dt.datetime(day.year, day.month, day.day, hh, mm, tzinfo=TZ)
        if slot.astimezone(dt.timezone.utc) >= now_utc + dt.timedelta(hours=1) and day not in taken:
            return slot.astimezone(dt.timezone.utc)
        day += dt.timedelta(days=1)


def iso_z(t: dt.datetime) -> str:
    return t.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------- Google / YouTube
def credentials(interactive=False):
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from google.auth.exceptions import RefreshError
    creds = Credentials.from_authorized_user_file(str(TOKEN), SCOPES) if TOKEN.exists() else None
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except RefreshError:
            creds = None
    if not creds or not creds.valid:
        if not interactive:
            LOGS.mkdir(parents=True, exist_ok=True)
            (LOGS / "youtube-auth-needed.txt").write_text(
                "Inloggen bij YouTube is verlopen. Voer uit: python playground\\youtube_upload.py auth\n", encoding="utf-8")
            sys.exit("FOUT: niet (meer) ingelogd. Voer 'python playground\\youtube_upload.py auth' uit.")
        from google_auth_oauthlib.flow import InstalledAppFlow
        if not CLIENT_SECRET.exists():
            sys.exit(f"FOUT: {CLIENT_SECRET} bestaat niet. Zie PLAYGROUND-YOUTUBE.md stap 1.")
        flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET), SCOPES)
        creds = flow.run_local_server(port=0, prompt="consent", access_type="offline")
    SECRETS.mkdir(parents=True, exist_ok=True)
    TOKEN.write_text(creds.to_json(), encoding="utf-8")
    (LOGS / "youtube-auth-needed.txt").unlink(missing_ok=True)
    return creds


def service(interactive=False):
    from googleapiclient.discovery import build
    return build("youtube", "v3", credentials=credentials(interactive), cache_discovery=False)


class QuotaError(Exception):
    pass


def resumable_upload(yt, file: Path, body: dict) -> str:
    from googleapiclient.http import MediaFileUpload
    from googleapiclient.errors import HttpError
    media = MediaFileUpload(str(file), mimetype="video/mp4", chunksize=8 * 1024 * 1024, resumable=True)
    req = yt.videos().insert(part="snippet,status", body=body, media_body=media)
    resp, tries = None, 0
    while resp is None:
        try:
            status, resp = req.next_chunk()
            if status:
                print(f"  {int(status.progress() * 100)}%", flush=True)
        except HttpError as e:
            reason = str(e)
            if e.resp.status == 403 and ("quota" in reason.lower() or "uploadLimitExceeded" in reason):
                raise QuotaError(reason)
            if e.resp.status not in (500, 502, 503, 504) or tries >= 5:
                raise
            tries += 1
        except (ConnectionError, TimeoutError, OSError):
            if tries >= 5:
                raise
            tries += 1
        else:
            continue
        wait = min(60, 2 ** tries) + random.random()
        print(f"  tijdelijke fout, opnieuw over {wait:.0f}s (poging {tries}/5)", flush=True)
        time.sleep(wait)
    return resp["id"]


def check_status(yt, vid: str) -> dict:
    items = yt.videos().list(part="status", id=vid).execute().get("items", [])
    return items[0]["status"] if items else {}


# ---------------------------------------------------------------- commando's
def cmd_auth(_):
    yt = service(interactive=True)
    ch = yt.channels().list(part="snippet", mine=True).execute().get("items", [])
    if not ch:
        sys.exit("Ingelogd, maar dit Google-account heeft geen YouTube-kanaal. Log in met het kanaal-account.")
    print(f"OK: ingelogd als kanaal '{ch[0]['snippet']['title']}'. Token staat in {TOKEN}")


def cmd_status(_):
    folders = video_folders()
    if not folders:
        print(f"Geen video-mappen in {VIDEOS}")
    for f in folders:
        s = folder_state(f)
        y = load_json(f / "youtube.json") or {}
        extra = f"  {y.get('url')}  publiceert {y.get('publishAt') or '-'}  {y.get('warning', '')}" if y else ""
        print(f"{f.name:40s} {s}{extra}")


def cmd_upload(a):
    ready = [f for f in video_folders() if (a.code is None or f.name == a.code) and folder_state(f) == "klaar"]
    if not ready:
        print("Niets te uploaden.")
        return 0
    yt = None if a.dry_run else service()
    done_count = 0
    for folder in ready[: a.max]:
        print(f"== {folder.name}")
        try:
            meta = build_metadata(folder)
        except ValueError as e:
            print(f"  OVERGESLAGEN: {e}")
            if not a.dry_run:
                (folder / "upload_error.txt").write_text(str(e) + "\n", encoding="utf-8")
            continue
        now = dt.datetime.now(dt.timezone.utc)
        publish_at = None if a.now else next_slot(a.publish_time, now)
        status = {"privacyStatus": "public" if a.now else "private", "selfDeclaredMadeForKids": False, "embeddable": True}
        if publish_at:
            status["publishAt"] = iso_z(publish_at)
        body = {"snippet": {**meta, "categoryId": CATEGORY_EDUCATION, "defaultLanguage": "en", "defaultAudioLanguage": "en"},
                "status": status}
        done = load_json(folder / "done.json") or {}
        clean = done.get("clean") or {}
        clean_file = folder / clean.get("file", "final_clean.mp4") if clean else None
        print(f"  titel: {meta['title']}")
        print(f"  tags: {', '.join(meta['tags'])}")
        print(f"  publiceert: {publish_at.astimezone(TZ).strftime('%a %d %b %H:%M') if publish_at else 'meteen'} (Amsterdam)")
        if clean_file and clean_file.exists() and not a.no_clean:
            print("  + schone docentenversie als niet-openbaar")
        if a.dry_run:
            print("  (dry-run: niets geupload)")
            continue
        try:
            vid = resumable_upload(yt, folder / "final.mp4", body)
        except QuotaError as e:
            print(f"  STOP: YouTube-quotum op voor vandaag ({e}). Morgen gaat hij vanzelf verder.")
            return 3
        st = check_status(yt, vid)
        record = {"videoId": vid, "url": f"https://www.youtube.com/watch?v={vid}", "shortsUrl": f"https://youtube.com/shorts/{vid}",
                  "title": meta["title"], "publishAt": st.get("publishAt") or (iso_z(publish_at) if publish_at else None),
                  "privacy": st.get("privacyStatus"), "uploadStatus": st.get("uploadStatus"), "uploadedAt": iso_z(now)}
        if publish_at and not st.get("publishAt"):
            record["warning"] = ("publishAt is weg: waarschijnlijk vergrendeld op prive (Google-project niet geaudit). "
                                 "Zet hem zelf op openbaar in YouTube Studio.")
        print(f"  OK: {record['shortsUrl']}  status={record['privacy']}  publishAt={record['publishAt']}")
        if record.get("warning"):
            print("  LET OP: " + record["warning"])
        if clean_file and clean_file.exists() and not a.no_clean:
            cbody = {"snippet": {"title": (meta["title"][:80] + " (classroom version)"),
                                 "description": "Classroom version without strong language.\n\n" + meta["description"],
                                 "tags": meta["tags"], "categoryId": CATEGORY_EDUCATION, "defaultLanguage": "en",
                                 "defaultAudioLanguage": "en"},
                     "status": {"privacyStatus": "unlisted", "selfDeclaredMadeForKids": False, "embeddable": True}}
            try:
                cid = resumable_upload(yt, clean_file, cbody)
                cst = check_status(yt, cid)
                record["clean"] = {"videoId": cid, "url": f"https://www.youtube.com/watch?v={cid}", "privacy": cst.get("privacyStatus")}
                print(f"  OK schoon: {record['clean']['url']}  status={record['clean']['privacy']}")
            except QuotaError:
                print("  schone versie: quotum op, volgende keer niet opnieuw geprobeerd (upload hem met de hand)")
        (folder / "youtube.json").write_text(json.dumps(record, indent=1), encoding="utf-8")
        done["youtube"] = record  # zodat de Sync-taak het mee terugneemt naar de Playground
        (folder / "done.json").write_text(json.dumps(done, indent=1, ensure_ascii=False), encoding="utf-8")
        done_count += 1
    print(f"Klaar: {done_count} video('s) geupload.")
    return 0


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("auth")
    sub.add_parser("status")
    u = sub.add_parser("upload")
    u.add_argument("--dry-run", action="store_true", help="alleen laten zien, niets uploaden")
    u.add_argument("--code", help="alleen deze map (bijv. 20261108-great-emu-war)")
    u.add_argument("--max", type=int, default=1, help="max aantal video's per run (standaard 1)")
    u.add_argument("--publish-time", default="17:00", help="publicatietijd Amsterdam (standaard 17:00)")
    u.add_argument("--now", action="store_true", help="meteen openbaar in plaats van ingepland")
    u.add_argument("--no-clean", action="store_true", help="schone docentenversie niet uploaden")
    a = p.parse_args()
    return {"auth": cmd_auth, "status": cmd_status, "upload": cmd_upload}[a.cmd](a) or 0


if __name__ == "__main__":
    sys.exit(main())
