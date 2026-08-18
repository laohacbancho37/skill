---
name: "video-transcript"
description: "Lấy transcript/nội dung video từ link YouTube, TikTok, Facebook: yt-dlp + STT API fallback, rồi tóm tắt gửi user."
---

# Video Transcript — link → nội dung

## Khi nào dùng

User gửi link video (YouTube, TikTok, Facebook, hoặc bất kỳ) và muốn biết nội dung, hoặc nói "lấy transcript", "tóm tắt video này", "video này nói gì".

## Pipeline

```text
URL
→ yt-dlp lấy metadata + subtitle có sẵn
→ có subtitle: dùng luôn
→ không có: tải audio mp3 (nhẹ hơn video)
→ gửi audio tới STT API (chunk 10 phút nếu dài)
→ xuất .txt / .srt / .json vào transcripts/
→ AI tóm tắt/tổng hợp → gửi user
```

## Chạy pipeline

```bash
python3 <skill-dir>/source/video_transcript.py "<URL>"
```

Tùy chọn:

```bash
--model large-v3          # mặc định, đa ngôn ngữ
--model phowhisper-large  # tối ưu tiếng Việt
--lang vi                 # ép ngôn ngữ
--keep-audio              # giữ file mp3 sau khi xong
```

Script tự:
- Detect platform từ URL (youtube/facebook/tiktok).
- Dùng cookie nếu có tại `$VIDEO_TRANSCRIPT_COOKIE_DIR/<platform>.txt` (mặc định `$OPENCLAW_WORKSPACE/cookies`).
- Ưu tiên subtitle vi → en → auto → bất kỳ.
- Không có subtitle: tải audio mp3 quality 5, chia chunk 600s, gửi STT.
- Xóa audio trung gian sau khi xong (trừ `--keep-audio`).
- In JSON metadata cuối cùng gồm `method`, `files`, `title`, `text_chars`.

## Đọc kết quả

- Transcript text: `$VIDEO_TRANSCRIPT_OUTPUT_DIR/<id>.txt` (mặc định `$OPENCLAW_WORKSPACE/transcripts`)
- SRT: `transcripts/<id>-<model>.srt`
- JSON segments: `transcripts/<id>-<model>.json`
- Metadata: `transcripts/<id>-meta.json`

## Tổng hợp nội dung gửi user

Sau khi có transcript, đọc file `.txt` và tổng hợp:

1. Tiêu đề video, kênh, thời lượng.
2. Tóm tắt nội dung chính (3–7 ý, tiếng Việt).
3. Trích dẫn quan trọng nếu có (kèm timestamp từ SRT nếu tiện).
4. Nếu transcript quá dài (>8000 từ): tóm tắt theo từng phần/chương.
5. Gửi file `.txt` kèm theo nếu user muốn bản đầy đủ (dùng MEDIA:).

## Lỗi thường gặp và xử lý

| Lỗi | Nguyên nhân | Xử lý |
|---|---|---|
| `Sign in to confirm you're not a bot` | YouTube chặn IP | Bảo user paste cookie YouTube vào Cookie Manager |
| `Cookie không hợp lệ` / video private | Cookie hết hạn | Cookie Manager: `http://127.0.0.1:14331` |
| `STT lỗi 401` | API key sai/hết hạn | Kiểm tra `~/.config/stt-api-key` |
| `STT lỗi 503/timeout` | GPU bận hoặc file quá lớn | Thử lại; chunk đã tự chia 600s |
| TikTok `Unable to extract` | TikTok đổi API | Cập nhật yt-dlp: `~/.local/share/yt-env/bin/pip install -U yt-dlp` |
| Facebook cần login | Video không public | Cần cookie Facebook |

## Cookie Manager

Web UI tại `http://127.0.0.1:14331` (chỉ bind localhost).

- 3 tab: YouTube, Facebook, TikTok.
- Paste JSON cookie (từ extension Cookie-Editor / Get cookies.txt) hoặc Netscape text.
- Lưu thành `cookies/<platform>.txt` (Netscape) cho yt-dlp dùng.
- Server: `<skill-dir>/source/cookie-manager.mjs`
- Nếu chưa chạy: `VIDEO_TRANSCRIPT_COOKIE_DIR="$OPENCLAW_WORKSPACE/cookies" nohup node <skill-dir>/source/cookie-manager.mjs > /tmp/cookie-manager.log 2>&1 &`

## STT API

- Base: biến môi trường `STT_BASE_URL` (bắt buộc, không commit endpoint riêng)
- Endpoint: `POST /v1/audio/transcriptions` (multipart, OpenAI-compatible)
- Auth: `Authorization: Bearer <key>` — key tại `~/.config/stt-api-key`
- Models: `large-v3` (đa ngôn ngữ), `phowhisper-large` (tiếng Việt tốt hơn)
- Hỗ trợ: MP3, MP4, M4A, WAV, WebM, FLAC, OGG
- Health check: `GET /health` (không cần key)

## Dependencies

- `yt-dlp`: đặt qua `YTDLP_BIN` hoặc dùng mặc định `~/.local/bin/yt-dlp`
- `ffmpeg` + `ffprobe`: phải có trên `PATH`
- Python 3.12 + `requests`
- Node.js cho Cookie Manager

## Quy tắc

- Không in API key ra chat hoặc log.
- Không gửi transcript ra ngoài hệ thống trừ khi user yêu cầu.
- File artefact giữ trong `transcripts/`; không xóa trừ khi user bảo.
- Nếu user chỉ hỏi "video này nói gì" mà không cần file: vẫn chạy pipeline, tóm tắt và trả lời, không cần gửi file trừ khi được hỏi.
