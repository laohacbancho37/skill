# CONTEXT.md

## Repository

`skill` is a public monorepo containing reusable OpenClaw skills. Each skill may contain instructions and a `source/` implementation.

## Current skill

`config-model-gui-openclaw` packages a local GUI that helps users configure OpenClaw model providers without memorizing CLI commands.

## Domain terms

- **Provider registry**: searchable list of known model/auth providers.
- **Custom Provider**: manual form for provider ID, adapter, base URL, auth, API key, and models.
- **Catalog**: model list resolved through OpenClaw's model resolver.
- **Merge**: update submitted providers while preserving omitted existing providers.
- **Replace**: intentionally make submitted provider/model lists exact and remove omitted entries.
- **Redacted sentinel**: `__OPENCLAW_REDACTED__`; never submit it as a credential.
- **Default model**: current `agents.defaults.model.primary`; refresh reads live config.

## Non-negotiable boundaries

- Public repository contains no real API keys, tokens, local config, or runtime logs.
- Credentials remain runtime-only on the user's machine.
- API key blank on save preserves existing key.
- Replace model arrays uses explicit replacement semantics.
- Default port is `18790`; occupied ports advance to next usable port.
