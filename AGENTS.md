# AGENTS.md

## Project

This repository is a public monorepo for reusable OpenClaw skills.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues. Use `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.

## Security

Never commit API keys, tokens, `~/.openclaw/openclaw.json`, runtime logs, or personal configuration. Keep credentials runtime-only.

## Verification

Run relevant syntax checks and tests before commit. For the OpenClaw model GUI:

```bash
node --check config-model-gui-openclaw/source/server.mjs
node --check config-model-gui-openclaw/source/public/app.js
```
