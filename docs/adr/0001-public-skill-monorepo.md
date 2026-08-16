# ADR-0001: Public skill monorepo

## Decision

Keep reusable OpenClaw skills in one public GitHub repository under `skill/<skill-name>/`.

## Consequences

- New skills share common agent guidance and issue workflow.
- Each skill must be independently documented.
- Credentials and local runtime state never enter the repository.
