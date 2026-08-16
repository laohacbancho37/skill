# OpenClaw Model Config GUI source

## Requirements

- Node.js 22+
- OpenClaw CLI available as `openclaw`
- Local OpenClaw config readable by the current user

## Run

```bash
npm start
```

Default bind: `127.0.0.1:18790`. If occupied, server tries the next usable port and prints the actual URL.

## Security

Keep bind local. Do not publish this server directly to the Internet. API keys are runtime data and must never be committed.
