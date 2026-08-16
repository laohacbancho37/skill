# config-model-gui-openclaw

GUI for configuring OpenClaw model providers using a flow close to `openclaw configure --section model`.

## Features

- Provider registry and Custom Provider form
- Merge/replace catalog behavior
- Model catalog through `openclaw models list`
- Default model refresh and preservation
- API-key preservation without storing credentials in source
- Automatic port fallback from `18790` to next available port

## Run

Requirements: Node.js, OpenClaw CLI, and a valid local OpenClaw config.

```bash
cd source
npm start
```

Default URL: `http://127.0.0.1:18790`. If busy, server tries next available port.

Never commit `~/.openclaw/openclaw.json`, API keys, tokens, or runtime logs.
