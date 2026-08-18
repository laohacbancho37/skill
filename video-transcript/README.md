# video-transcript

OpenClaw skill for extracting transcripts from YouTube, TikTok, Facebook, and other `yt-dlp`-compatible URLs.

## Flow

1. Read video metadata and available subtitles using `yt-dlp`.
2. Prefer Vietnamese, then English, then any subtitle.
3. If no subtitle exists, download MP3 audio, split it into 10-minute chunks, and submit chunks to an OpenAI-compatible STT endpoint.
4. Write `.txt`, `.srt`, `.json`, and metadata outputs.

## Install

Copy `video-transcript/` into your OpenClaw skills directory, then follow [`SKILL.md`](./SKILL.md).

Dependencies:

- Python 3 with `requests`
- `yt-dlp`
- `ffmpeg` and `ffprobe`
- Node.js only for optional Cookie Manager

## Required runtime configuration

```bash
export OPENCLAW_WORKSPACE="$HOME/.openclaw/workspace"
export STT_BASE_URL="https://your-stt-host.example"
# Either use an environment variable:
export STT_API_KEY="..."
# Or store STT_API_KEY=... in ~/.config/stt-api-key
```

Optional overrides:

```bash
export YTDLP_BIN="$HOME/.local/bin/yt-dlp"
export VIDEO_TRANSCRIPT_OUTPUT_DIR="$OPENCLAW_WORKSPACE/transcripts"
export VIDEO_TRANSCRIPT_COOKIE_DIR="$OPENCLAW_WORKSPACE/cookies"
```

## Run

```bash
python3 source/video_transcript.py "https://www.youtube.com/watch?v=..." --lang vi
```

## Cookie Manager

For platforms requiring login, start local Cookie Manager. It binds to `127.0.0.1` by default.

```bash
VIDEO_TRANSCRIPT_COOKIE_DIR="$OPENCLAW_WORKSPACE/cookies" \
  node source/cookie-manager.mjs
```

Open `http://127.0.0.1:14331` and paste cookies exported from browser. Cookies remain local. Never commit them.

## Security

This repository contains no API key, cookie, endpoint, transcript, or runtime configuration. Use environment variables or files outside repository for sensitive values.
