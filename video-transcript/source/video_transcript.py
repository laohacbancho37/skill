#!/usr/bin/env python3
"""
video_transcript.py — link → transcript
Luồng:
  1. yt-dlp lấy metadata + subtitle có sẵn
  2. Không có subtitle → tải audio (mp3, nhẹ)
  3. Gửi audio tới STT API (chunk nếu dài)
  4. Xuất .txt / .srt / .json vào transcripts/
Cách dùng:
  python3 video_transcript.py <URL> [--model large-v3|phowhisper-large] [--lang vi] [--keep-audio]
"""
import argparse, json, os, re, subprocess, sys, time, shutil
from pathlib import Path

DEFAULT_WORKSPACE = Path(os.environ.get("OPENCLAW_WORKSPACE", Path.home() / ".openclaw" / "workspace"))
WORKSPACE = Path(os.environ.get("VIDEO_TRANSCRIPT_WORKSPACE", DEFAULT_WORKSPACE))
OUT_DIR = Path(os.environ.get("VIDEO_TRANSCRIPT_OUTPUT_DIR", WORKSPACE / "transcripts"))
COOKIE_DIR = Path(os.environ.get("VIDEO_TRANSCRIPT_COOKIE_DIR", WORKSPACE / "cookies"))
YTDLP = os.environ.get("YTDLP_BIN", os.path.expanduser("~/.local/bin/yt-dlp"))
# YouTube hiện cần EJS challenge solver. Node đã có sẵn; cho phép yt-dlp lấy component EJS chính thức.
YTDLP_RUNTIME_ARGS = ["--js-runtimes", "node", "--remote-components", "ejs:npm"]
STT_KEY_FILE = Path.home() / ".config" / "stt-api-key"
STT_BASE = os.environ.get("STT_BASE_URL", "").rstrip("/")
CHUNK_SECONDS = 600  # 10 phút/chunk cho STT

def log(msg): print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def read_stt_key():
    env_key = os.environ.get("STT_API_KEY", "").strip()
    if env_key: return env_key
    if STT_KEY_FILE.exists():
        raw = STT_KEY_FILE.read_text().strip()
        # file có thể chứa "STT_API_KEY=***" hoặc key trần
        if raw.startswith("STT_API_KEY="):
            raw = raw.split("=", 1)[1].strip()
        return raw
    sys.exit("Lỗi: không tìm thấy STT API key (env STT_API_KEY hoặc ~/.config/stt-api-key)")

def detect_platform(url):
    u = url.lower()
    if "youtube.com" in u or "youtu.be" in u: return "youtube"
    if "facebook.com" in u or "fb.watch" in u or "fb.com" in u: return "facebook"
    if "tiktok.com" in u or "vm.tiktok" in u: return "tiktok"
    return None

def cookie_args(platform):
    if not platform: return []
    f = COOKIE_DIR / f"{platform}.txt"
    if f.exists(): return ["--cookies", str(f)]
    return []

def run(cmd, **kw):
    cmd = list(cmd)
    if cmd and cmd[0] == YTDLP:
        cmd[1:1] = YTDLP_RUNTIME_ARGS
    log("CMD: " + " ".join(str(c) for c in cmd[:10]) + (" ..." if len(cmd) > 10 else ""))
    return subprocess.run(cmd, capture_output=True, text=True, **kw)

def get_info(url, platform):
    cmd = [YTDLP, "--dump-json", "--no-warnings", "--no-playlist", url] + cookie_args(platform)
    r = run(cmd, timeout=120)
    if r.returncode != 0:
        return None, r.stderr.strip()[-500:]
    try:
        return json.loads(r.stdout), None
    except json.JSONDecodeError:
        return None, "JSON parse lỗi: " + r.stdout[:200]

def has_subtitles(info):
    subs = info.get("subtitles") or {}
    autos = info.get("automatic_captions") or {}
    for d in (subs, autos):
        for lang in d:
            if lang.split("-")[0] in ("vi", "en") or lang in ("vi", "en", "orig"):
                return True
    return bool(subs) or bool(autos)

def download_subs(url, platform, vid, info):
    """Tải subtitle, ưu tiên vi rồi en, rồi auto."""
    subs = info.get("subtitles") or {}
    autos = info.get("automatic_captions") or {}
    pref = ["vi", "en"]
    chosen = None
    for lang in pref:
        for src, tag in ((subs, "manual"), (autos, "auto")):
            for k in src:
                if k == lang or k.startswith(lang + "-"):
                    chosen = (k, tag); break
            if chosen: break
        if chosen: break
    if not chosen:
        # lấy bất kỳ cái nào có
        for src, tag in ((subs, "manual"), (autos, "auto")):
            if src:
                chosen = (list(src.keys())[0], tag); break
    if not chosen: return None
    lang, tag = chosen
    log(f"Subtitle tìm thấy: {lang} ({tag})")
    cmd = [YTDLP, "--no-playlist", "--skip-download",
           "--write-subs" if tag == "manual" else "--write-auto-subs",
           "--sub-langs", lang, "--sub-format", "srt/vtt/best",
           "-o", str(OUT_DIR / f"{vid}.%(ext)s"), url] + cookie_args(platform)
    r = run(cmd, timeout=180)
    # tìm file srt/vtt vừa tải
    for ext in ("srt", "vtt"):
        f = OUT_DIR / f"{vid}.{lang}.{ext}"
        if f.exists(): return f
        f2 = OUT_DIR / f"{vid}.{ext}"
        if f2.exists(): return f2
    # glob tìm
    import glob
    hits = sorted(glob.glob(str(OUT_DIR / f"{vid}*.*")))
    for h in hits:
        if h.endswith((".srt", ".vtt")): return Path(h)
    return None

def vtt_to_text(path):
    raw = path.read_text(encoding="utf-8", errors="ignore")
    lines = []
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith(("WEBVTT", "NOTE", "STYLE", "Kind:", "Language:")): continue
        if "-->" in line: continue
        if re.match(r"^\d+$", line): continue
        # bỏ tag <...>
        clean = re.sub(r"<[^>]+>", "", line)
        if clean and (not lines or lines[-1] != clean):
            lines.append(clean)
    return "\n".join(lines)

def srt_to_text(path):
    raw = path.read_text(encoding="utf-8", errors="ignore")
    lines = []
    for block in re.split(r"\n\s*\n", raw):
        blines = [l.strip() for l in block.strip().splitlines()]
        text_lines = [l for l in blines if l and "-->" not in l and not re.match(r"^\d+$", l)]
        if text_lines:
            lines.append(" ".join(text_lines))
    return "\n".join(lines)

def download_audio(url, platform, vid):
    out = OUT_DIR / f"{vid}.mp3"
    if out.exists():
        log(f"Audio đã có: {out}")
        return out
    cmd = [YTDLP, "--no-playlist", "-x", "--audio-format", "mp3",
           "--audio-quality", "5", "-o", str(OUT_DIR / f"{vid}.%(ext)s"), url] + cookie_args(platform)
    r = run(cmd, timeout=900)
    if r.returncode != 0:
        log("yt-dlp audio lỗi: " + r.stderr[-400:])
        return None
    if out.exists(): return out
    import glob
    hits = glob.glob(str(OUT_DIR / f"{vid}*.mp3"))
    return Path(hits[0]) if hits else None

def audio_duration(path):
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)], timeout=30)
    try: return float(r.stdout.strip())
    except ValueError: return 0

def split_audio(path, chunk_sec=CHUNK_SECONDS):
    dur = audio_duration(path)
    if dur <= chunk_sec: return [path], dur
    n = int(dur // chunk_sec) + 1
    log(f"Audio {dur:.0f}s → chia {n} chunk {chunk_sec}s")
    chunk_dir = OUT_DIR / f"{path.stem}-chunks"
    chunk_dir.mkdir(exist_ok=True)
    parts = []
    for i in range(n):
        out = chunk_dir / f"part-{i:03d}.mp3"
        if not out.exists():
            run(["ffmpeg", "-y", "-i", str(path), "-ss", str(i * chunk_sec),
                 "-t", str(chunk_sec), "-ac", "1", "-ar", "16000", "-b:a", "48k",
                 str(out)], timeout=120)
        parts.append(out)
    return parts, dur

def stt_transcribe(audio_path, key, model="large-v3", language=None):
    import requests
    if not STT_BASE:
        raise RuntimeError("Thiếu STT_BASE_URL (ví dụ: https://stt.example.com)")
    url = f"{STT_BASE}/v1/audio/transcriptions"
    headers = {"Authorization": f"Bearer {key}"}
    data = {"model": model, "response_format": "verbose_json", "vad_filter": "true"}
    if language: data["language"] = language
    with open(audio_path, "rb") as f:
        files = {"file": (audio_path.name, f, "audio/mpeg")}
        log(f"STT: gửi {audio_path.name} ({audio_path.stat().st_size // 1024}KB) model={model}")
        r = requests.post(url, headers=headers, data=data, files=files, timeout=1800)
    if r.status_code != 200:
        raise RuntimeError(f"STT lỗi {r.status_code}: {r.text[:300]}")
    return r.json()

def verbose_json_to_srt(vj, offset=0.0):
    def ts(sec):
        ms = int((sec + offset) * 1000)
        h, ms = divmod(ms, 3600000)
        m, ms = divmod(ms, 60000)
        s, ms = divmod(ms, 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
    lines = []
    for i, seg in enumerate(vj.get("segments", []), 1):
        lines.append(str(i))
        lines.append(f"{ts(seg['start'])} --> {ts(seg['end'])}")
        lines.append(seg.get("text", "").strip())
        lines.append("")
    return "\n".join(lines)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--model", default="large-v3", choices=["large-v3", "phowhisper-large"])
    ap.add_argument("--lang", default=None)
    ap.add_argument("--keep-audio", action="store_true")
    args = ap.parse_args()

    OUT_DIR.mkdir(exist_ok=True)
    url = args.url.strip()
    platform = detect_platform(url)
    log(f"Platform: {platform or 'không xác định'}")

    info, err = get_info(url, platform)
    if not info:
        sys.exit(f"Không lấy được metadata: {err}")

    vid = info.get("id", "unknown")
    title = info.get("title", vid)
    duration = info.get("duration") or 0
    log(f"Video: {title} | id={vid} | {duration}s")

    result = {
        "url": url, "id": vid, "title": title, "platform": platform,
        "duration_sec": duration, "method": None, "model": None,
        "files": {}, "text": None,
    }

    # Bước 1: thử subtitle
    if has_subtitles(info):
        sub_file = download_subs(url, platform, vid, info)
        if sub_file:
            text = srt_to_text(sub_file) if sub_file.suffix == ".srt" else vtt_to_text(sub_file)
            txt_out = OUT_DIR / f"{vid}.txt"
            txt_out.write_text(text, encoding="utf-8")
            result["method"] = "subtitle"
            result["files"]["subtitle"] = str(sub_file)
            result["files"]["txt"] = str(txt_out)
            result["text"] = text
            log(f"Xong bằng subtitle: {txt_out}")
            finish(result, args)
            return

    # Bước 2: tải audio + STT
    log("Không có subtitle phù hợp → tải audio + STT")
    audio = download_audio(url, platform, vid)
    if not audio:
        sys.exit("Tải audio thất bại")
    result["files"]["audio"] = str(audio)

    key = read_stt_key()
    parts, dur = split_audio(audio)
    all_segments = []
    all_text = []
    offset = 0.0
    for i, part in enumerate(parts):
        vj = stt_transcribe(part, key, model=args.model, language=args.lang)
        segs = vj.get("segments", [])
        if len(parts) > 1:
            # offset theo chunk index
            offset = i * CHUNK_SECONDS
        srt_part = verbose_json_to_srt(vj, offset=offset if len(parts) > 1 else 0)
        all_text.append(vj.get("text", "").strip())
        for seg in segs:
            seg2 = dict(seg)
            if len(parts) > 1:
                seg2["start"] = seg["start"] + offset
                seg2["end"] = seg["end"] + offset
            all_segments.append(seg2)

    full_text = "\n".join(t for t in all_text if t)
    txt_out = OUT_DIR / f"{vid}.txt"
    txt_out.write_text(full_text, encoding="utf-8")

    # SRT ghép
    def ts(sec):
        ms = int(sec * 1000)
        h, ms = divmod(ms, 3600000)
        m, ms = divmod(ms, 60000)
        s, ms = divmod(ms, 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
    srt_lines = []
    for i, seg in enumerate(all_segments, 1):
        srt_lines += [str(i), f"{ts(seg['start'])} --> {ts(seg['end'])}", seg.get("text", "").strip(), ""]
    srt_out = OUT_DIR / f"{vid}-{args.model}.srt"
    srt_out.write_text("\n".join(srt_lines), encoding="utf-8")

    json_out = OUT_DIR / f"{vid}-{args.model}.json"
    json_out.write_text(json.dumps({"text": full_text, "segments": all_segments,
                                     "model": args.model, "language": args.lang},
                                    ensure_ascii=False, indent=1), encoding="utf-8")

    result["method"] = "stt"
    result["model"] = args.model
    result["files"]["txt"] = str(txt_out)
    result["files"]["srt"] = str(srt_out)
    result["files"]["json"] = str(json_out)
    result["text"] = full_text
    log(f"Xong bằng STT ({args.model}): {txt_out}")
    finish(result, args)

def finish(result, args):
    meta_out = OUT_DIR / f"{result['id']}-meta.json"
    meta = {k: v for k, v in result.items() if k != "text"}
    meta["text_chars"] = len(result.get("text") or "")
    meta_out.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    if not args.keep_audio and result["method"] == "stt":
        af = result["files"].get("audio")
        if af and Path(af).exists():
            Path(af).unlink()
            log("Đã xóa audio trung gian (dùng --keep-audio để giữ)")
    print("\n=== KẾT QUẢ ===")
    print(json.dumps(meta, ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()
