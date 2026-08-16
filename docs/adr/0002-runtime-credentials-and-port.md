# ADR-0002: Runtime credentials and port fallback

## Decision

Read credentials only at runtime from the local OpenClaw installation. Never store real credentials in skill source or repository files. Start GUI at port `18790`; if occupied, try the next usable port.

## Consequences

The GUI requires a local OpenClaw environment. Users must inspect the printed URL when fallback port is used.
