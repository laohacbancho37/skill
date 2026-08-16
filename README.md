# OpenClaw Skills

Public skills for OpenClaw.

## Skills

- [`config-model-gui-openclaw`](./config-model-gui-openclaw/) — GUI workflow and source for configuring OpenClaw model providers. Includes runtime API-key preservation, CLI-backed model catalog, merge/replace semantics, default-model refresh, and automatic port fallback.

## Security

This repository must never contain API keys, tokens, `~/.openclaw/openclaw.json`, runtime logs, or personal configuration. Credentials stay on the user's machine and are read only at runtime when needed. Each skill source must include checks and documentation suitable for users outside the original machine.
