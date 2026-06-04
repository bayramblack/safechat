# UnderNet Safe Chat https://safechat.online/

> Open source — MIT licensed.

UnderNet Safe Chat is a privacy-focused 1-on-1 messenger built around wallet-based identity. There are no usernames, no emails, and no passwords — every account is a 24-word BIP-39 seed phrase that derives a deterministic wallet address. The project is delivered as a dark-themed installable PWA backed by an Express + Socket.io API.

You can run it locally on a laptop, deploy it to a single Ubuntu server, or fork it and rebrand it. It is yours.

## Features

- **Wallet-based identity** — BIP-39 24-word seed phrase, no email or password
- **Real-time messaging** — Socket.io WebSocket transport with HTTP long-polling fallback
- **Message status tracking** — sent, delivered, read with timestamps
- **File sharing** — images and documents (JPEG, PNG, WebP, PDF, TXT, ZIP, DOC/DOCX), 25 MB max
- **Voice messages and video messages** — record in-app, play back inline
- **Voice and video calls** — peer-to-peer WebRTC with mute, end, speaker, and camera controls
- **Web push notifications** — VAPID-based notifications for offline messages and incoming calls
- **Built-in AI assistant** — UnderNet GPT, an in-app AI chat
- **Progressive Web App** — installable on mobile and desktop, dark theme, safe-area aware
- **Secrets-safe by design** — seed phrases are never stored (only SHA-256 hashes), session tokens are httpOnly cookies, file uploads are MIME/extension whitelisted

## Tech Stack

Node.js 24 · pnpm workspaces · Express 5 · Socket.io 4 · PostgreSQL + Drizzle ORM · Zod · React 19 + Vite + Tailwind CSS 4 · web-push (VAPID) · Pino logging.

## Quick Start (Local Development)

Prerequisites: Node.js 24+, pnpm 9+, PostgreSQL 15+.

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env and set DATABASE_URL to your local Postgres connection string

# 3. Push the database schema
pnpm --filter @workspace/db run push

# 4. Build everything
pnpm run build

# 5. Start the API server
pnpm --filter @workspace/api-server run dev
```

Then visit `http://localhost:3001/api/healthz` to confirm the API is up. The frontend lives in `artifacts/undernet` and can be started with `pnpm --filter @workspace/undernet run dev`.

For the full local development guide (database setup, environment variables, schema, etc.) see [DOCUMENTATION.md](./DOCUMENTATION.md).

## Quick Start (Ubuntu Server)

The repository ships with a complete, copy-pasteable deployment guide for a fresh Ubuntu 22.04 / 24.04 server, covering Node.js, PostgreSQL, Nginx, PM2, Let's Encrypt HTTPS, the WebSocket reverse proxy, and a hardened firewall.

```bash
# On a fresh Ubuntu host:
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential nginx certbot python3-certbot-nginx

# Then follow DEPLOYMENT.md step-by-step.
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the complete guide.

## Documentation

- [DOCUMENTATION.md](./DOCUMENTATION.md) — project overview, architecture, REST API reference, WebSocket events, database schema, security notes, and local development setup
- [DEPLOYMENT.md](./DEPLOYMENT.md) — step-by-step Ubuntu deployment guide (system packages → Node.js → PostgreSQL → app build → PM2 → Nginx → HTTPS → firewall → maintenance)

You can also browse rendered docs from inside the running app: open **Settings → About & Open Source → View Documentation**.

## Source Code

The full project source lives on GitHub: [github.com/bayramblack/safechat](https://github.com/bayramblack/safechat). Clone or fork the repository, run `pnpm install`, and follow `DEPLOYMENT.md` to self-host on any server.

You can also reach the repository from inside the app: **Settings → About & Open Source → Open GitHub repository**.

## Contributing & Issues

This is an open source project under the MIT license. Pull requests, issues, and forks are welcome. There is no central repository required — you can self-host, fork, and rebrand freely.

## License

MIT — see [LICENSE](./LICENSE).

https://safechat.online/
