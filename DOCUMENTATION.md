# UnderNet Safe Chat — Documentation

## License — MIT

UnderNet Safe Chat is released under the [MIT license](./LICENSE). You are free to use, copy, modify, distribute, and self-host the project, including for commercial purposes. See `README.md` for a project introduction and `DEPLOYMENT.md` for the Ubuntu self-hosting guide.

## Project Overview

UnderNet Safe Chat is a privacy-focused 1-on-1 messaging platform built around wallet-based identity. Users authenticate using BIP-39 24-word seed phrases instead of usernames, passwords, or email addresses. The system supports real-time text messaging, image and file sharing, voice calls via WebRTC, push notifications, and offline message queuing — all over a dark-themed progressive web app (PWA).

### Key Features (Backend API)

- **Wallet-based identity** — 24-word BIP-39 seed phrase generates a deterministic wallet address used as the user's identity
- **Real-time messaging** — Socket.io WebSocket transport with automatic HTTP long-polling fallback
- **Message status tracking** — sent → delivered → read with timestamps
- **File sharing** — upload/download images (JPEG, PNG, WebP) and documents (PDF, TXT, ZIP, DOC/DOCX)
- **Voice calling** — peer-to-peer WebRTC voice calls with call initiation, accept, reject, and end signaling via WebSocket signaling
- **Push notifications** — Web Push (VAPID) for offline message and call alerts
- **Fallback polling** — REST-based sync endpoints for catching missed events when WebSocket reconnects
- **Message deduplication** — client-generated UUIDs prevent duplicates on retry/reconnect

### Current Frontend Status

The frontend in `artifacts/undernet` is a UI prototype with mock service layers. It demonstrates the visual design and interaction patterns but uses a local mock socket service (`src/lib/socket.ts`) rather than a real Socket.io connection. A production frontend integration would connect to the backend Socket.io server and use the sync REST endpoints for reliability.

---

## Architecture

```
┌──────────────────┐         ┌─────────────────────┐
│                  │  HTTP   │                     │
│  Frontend (PWA)  │◄───────►│  Express 5 API      │
│  React + Vite    │  WS     │  Socket.io          │
│                  │◄───────►│  (Node.js)          │
└──────────────────┘         └──────────┬──────────┘
                                        │
                             ┌──────────▼──────────┐
                             │   PostgreSQL        │
                             │   (Drizzle ORM)     │
                             └──────────┬──────────┘
                                        │
                             ┌──────────▼──────────┐
                             │   Object Storage    │
                             │   (GCS)             │
                             └─────────────────────┘
```

### Technology Stack

| Layer | Technology |
|---|---|
| Backend runtime | Node.js 24+ |
| API framework | Express 5 |
| Real-time | Socket.io 4 |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod v4 |
| Build | esbuild (ESM bundle) |
| Authentication | BIP-39, SHA-256 hashing, httpOnly session cookies |
| File storage | Google Cloud Storage |
| Push notifications | web-push (VAPID) |
| Logging | Pino (with redaction of sensitive headers) |
| Frontend | React 19, Vite, Tailwind CSS 4 |
| Monorepo | pnpm workspaces |

### Monorepo Structure

```
project/
├── artifacts/
│   └── api-server/           # Express API + Socket.io server
│       ├── src/
│       │   ├── index.ts       # Entry: HTTP server + WebSocket + VAPID init
│       │   ├── app.ts         # Express middleware stack
│       │   ├── routes/        # REST API route handlers
│       │   │   ├── auth.ts         # Identity creation, import, session management
│       │   │   ├── conversations.ts # Conversation CRUD
│       │   │   ├── messages.ts      # Message send/receive, status updates
│       │   │   ├── upload.ts        # File upload/download with security
│       │   │   ├── sync.ts          # Fallback polling endpoints
│       │   │   ├── notifications.ts # Push subscription management
│       │   │   ├── storage.ts       # Object storage presigned URLs
│       │   │   └── health.ts        # Health check
│       │   └── lib/           # Shared server utilities
│       │       ├── auth.ts         # Token hashing, session middleware
│       │       ├── websocket.ts    # Socket.io setup, event handlers
│       │       ├── notifications.ts # VAPID config, push sending
│       │       ├── objectStorage.ts # GCS client wrapper
│       │       └── logger.ts       # Pino logger with redaction
│       ├── build.mjs          # esbuild configuration
│       └── package.json
├── lib/
│   ├── db/                    # Database layer
│   │   ├── src/schema/        # Drizzle table definitions
│   │   │   ├── users.ts
│   │   │   ├── sessions.ts
│   │   │   ├── conversations.ts
│   │   │   ├── messages.ts
│   │   │   ├── attachments.ts
│   │   │   ├── callSessions.ts
│   │   │   └── notificationSubscriptions.ts
│   │   └── drizzle.config.ts  # Drizzle Kit config for migrations
│   ├── api-spec/              # OpenAPI 3.1 specification
│   ├── api-zod/               # Generated Zod schemas
│   └── api-client-react/      # Generated React Query hooks
├── .env.example               # Environment variable template
├── package.json               # Root package with build/typecheck scripts
└── pnpm-workspace.yaml        # Workspace configuration
```

---

## Database Schema

### Tables

**users** — Wallet-based user accounts

| Column | Type | Description |
|---|---|---|
| id | serial PK | Auto-increment user ID |
| wallet_address | text UNIQUE | Deterministic address derived from seed phrase |
| seed_hash | text | SHA-256 hash of the seed phrase (never store raw) |
| display_name | text | Optional display name |
| avatar_url | text | Optional avatar URL |
| last_seen_at | timestamp | Last activity timestamp |
| is_active | boolean | Account active status |
| created_at | timestamp | Account creation time |
| updated_at | timestamp | Last update time |

**sessions** — Authentication sessions

| Column | Type | Description |
|---|---|---|
| id | serial PK | Session ID |
| user_id | integer FK→users | Session owner |
| token_hash | text UNIQUE | SHA-256 hash of session token |
| device_info | text | Optional device identifier |
| is_revoked | boolean | Whether session has been revoked |
| created_at | timestamp | Session creation time |
| expires_at | timestamp | Expiration (30 days, auto-renewed within 7 days) |

**conversations** — 1-on-1 chat conversations

| Column | Type | Description |
|---|---|---|
| id | serial PK | Conversation ID |
| type | text | Conversation type (always "direct") |
| participant_a | integer FK→users | Lower user ID |
| participant_b | integer FK→users | Higher user ID |
| last_message_id | integer | ID of most recent message |
| created_at | timestamp | Creation time |
| updated_at | timestamp | Last activity time |

Unique constraint on (participant_a, participant_b) prevents duplicate conversations.

**messages** — Chat messages

| Column | Type | Description |
|---|---|---|
| id | serial PK | Message ID |
| client_message_id | text | Client-generated UUID for deduplication |
| conversation_id | integer FK→conversations | Parent conversation |
| sender_id | integer FK→users | Message sender |
| type | enum | "text", "image", or "file" |
| text_content | text | Message text (for text type) |
| attachment_id | integer | Reference to attachment (for image/file type) |
| status | enum | "sent", "delivered", or "read" |
| delivered_at | timestamp | When marked delivered |
| read_at | timestamp | When marked read |
| created_at | timestamp | When sent |

Unique constraint on (sender_id, conversation_id, client_message_id) prevents duplicate messages.

**attachments** — Uploaded files

| Column | Type | Description |
|---|---|---|
| id | serial PK | Attachment ID |
| uploaded_by | integer FK→users | Uploader |
| message_id | integer FK→messages | Linked message (set after send) |
| original_name | text | Original filename |
| safe_name | text | Sanitized filename with unique suffix |
| mime_type | text | Validated MIME type |
| file_size | bigint | File size in bytes |
| storage_key | text | Object storage path |
| created_at | timestamp | Upload time |

**call_sessions** — Voice call records

| Column | Type | Description |
|---|---|---|
| id | serial PK | Call session ID |
| caller_id | integer FK→users | Call initiator |
| receiver_id | integer FK→users | Call recipient |
| conversation_id | integer FK→conversations | Associated conversation |
| status | enum | "ringing", "active", "ended", "rejected", "missed" |
| started_at | timestamp | When call was answered |
| ended_at | timestamp | When call ended |
| created_at | timestamp | When call was initiated |

**notification_subscriptions** — Web Push subscriptions

| Column | Type | Description |
|---|---|---|
| id | serial PK | Subscription ID |
| user_id | integer FK→users | Subscriber |
| subscription_data | text | JSON Web Push subscription object |
| is_active | boolean | Active status |
| created_at | timestamp | Registration time |
| updated_at | timestamp | Last update |

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | Yes | — | Port the server listens on |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `NODE_ENV` | No | `development` | Set to `production` for secure cookies, structured logging |
| `LOG_LEVEL` | No | `info` | Pino log level (trace, debug, info, warn, error, fatal) |
| `CORS_ORIGINS` | No | All in dev, none in prod | Comma-separated allowed origins |
| `VAPID_PUBLIC_KEY` | For push | — | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | For push | — | Web Push VAPID private key |
| `VAPID_SUBJECT` | No | `mailto:admin@example.com` | VAPID contact URI |
| `PUBLIC_OBJECT_SEARCH_PATHS` | For storage | — | Comma-separated GCS paths for public objects |
| `PRIVATE_OBJECT_DIR` | For storage | — | GCS path for private file uploads |

Generate VAPID keys with:
```bash
npx web-push generate-vapid-keys
```

---

## API Reference

All endpoints are prefixed with `/api`. Authentication uses httpOnly session cookies (set on create/import).

### Health
- `GET /api/healthz` — Returns `{"status":"ok"}`

### Authentication
- `POST /api/auth/create` — Generate new identity (returns seed phrase, wallet address, sets session cookie)
- `POST /api/auth/import` — Import existing seed phrase (body: `{seedPhrase}`)
- `POST /api/auth/restore` — Restore session from existing cookie
- `POST /api/auth/logout` — Revoke current session
- `GET /api/auth/me` — Get current user profile

### Conversations
- `GET /api/conversations` — List all conversations with last message preview
- `POST /api/conversations` — Create or open conversation (body: `{walletAddress}`)
- `GET /api/conversations/:id` — Get conversation details

### Messages
- `GET /api/conversations/:id/messages?cursor=&limit=` — Paginated messages (newest first)
- `POST /api/conversations/:id/messages` — Send message (body: `{type, textContent, clientMessageId, attachmentId}`)
- `PATCH /api/messages/:id/delivered` — Mark as delivered (recipient only)
- `PATCH /api/messages/:id/read` — Mark as read (recipient only)

### File Upload
- `POST /api/upload` — Upload file (multipart/form-data, field: "file", max 25MB)
- `GET /api/download/:id` — Download file by attachment ID

### Sync (Fallback Polling)
- `GET /api/sync/messages?since=` — Fetch messages since timestamp (ms)
- `GET /api/sync/conversations?since=` — Fetch conversation updates since timestamp
- `GET /api/sync/status?since=` — Fetch message status updates since timestamp

### Push Notifications
- `POST /api/notifications/subscribe` — Register push subscription (body: `{subscription}`)
- `DELETE /api/notifications/unsubscribe` — Remove push subscription
- `GET /api/notifications/status` — Check subscription status and get VAPID public key

### Object Storage
- `POST /api/storage/uploads/request-url` — Get presigned upload URL
- `GET /api/storage/public-objects/*filePath` — Serve public objects

---

## WebSocket Events

Socket.io connects at path `/api/socket.io`. Authentication via `auth.token` handshake parameter or session cookie.

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `join_conversation` | `conversationId: number` | Join a conversation room |
| `leave_conversation` | `conversationId: number` | Leave a conversation room |
| `new_message` | `{conversationId, clientMessageId, type?, textContent?, attachmentId?}` | Send a message |
| `message_delivered` | `{messageId, conversationId}` | Mark message delivered |
| `message_read` | `{messageId, conversationId}` | Mark message read |
| `typing_start` | `{conversationId}` | Start typing indicator |
| `typing_stop` | `{conversationId}` | Stop typing indicator |
| `presence_update` | `{status}` | Update presence status |
| `call_initiate` | `{conversationId, receiverId, offer?}` | Start a voice call |
| `call_accept` | `{callSessionId, answer?}` | Accept incoming call |
| `call_reject` | `{callSessionId}` | Reject incoming call |
| `call_end` | `{callSessionId}` | End active call |
| `ice_candidate` | `{callSessionId, targetUserId, candidate}` | Send ICE candidate |
| `call_offer` | `{callSessionId, targetUserId, offer}` | Send WebRTC offer |
| `call_answer` | `{callSessionId, targetUserId, answer}` | Send WebRTC answer |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `message_saved` | Message object | Confirmation of sent message |
| `new_message` | Message object | Incoming message from peer |
| `message_delivered` | `{messageId, deliveredAt}` | Delivery receipt |
| `message_read` | `{messageId, readAt}` | Read receipt |
| `typing_start` | `{userId, conversationId}` | Peer started typing |
| `typing_stop` | `{userId, conversationId}` | Peer stopped typing |
| `user_online` | `{userId, timestamp}` | Peer came online |
| `user_offline` | `{userId, timestamp}` | Peer went offline |
| `presence_update` | `{userId, status, timestamp}` | Peer presence change |
| `call_initiate` | `{callSessionId, callerId, conversationId, offer?}` | Incoming call |
| `call_ringing` | `{callSessionId}` | Call is ringing |
| `call_accept` | `{callSessionId, answer?}` | Call accepted |
| `call_reject` | `{callSessionId}` | Call rejected |
| `call_end` | `{callSessionId}` | Call ended |
| `ice_candidate` | `{callSessionId, candidate, fromUserId}` | ICE candidate from peer |
| `call_offer` | `{callSessionId, offer, fromUserId}` | WebRTC offer from peer |
| `call_answer` | `{callSessionId, answer, fromUserId}` | WebRTC answer from peer |
| `call_error` | `{error}` | Call-related error |
| `error_event` | `{error}` | General error |

---

## WebSocket Reliability (Backend)

The following describes the backend server capabilities. The current frontend (`artifacts/undernet`) uses a mock socket service for UI prototyping; a production frontend would integrate with the real Socket.io server and sync endpoints as described below.

### Connection Management
- Socket.io automatically provides HTTP long-polling fallback if WebSocket upgrade fails
- Multiple simultaneous connections per user are tracked (multi-device support)
- Users are marked online when any socket connects, offline when all sockets disconnect

### Disconnect Handling
- On disconnect, the socket is removed from the user's connection set
- When the last socket disconnects, `user_offline` is broadcast to all peers
- The `lastSeenAt` timestamp is updated in the database

### Fallback Polling
When WebSocket is disconnected, a production client should poll the sync endpoints:
- `GET /api/sync/messages?since=<timestamp>` — every 5 seconds
- `GET /api/sync/status?since=<timestamp>` — every 5 seconds
- `GET /api/sync/conversations?since=<timestamp>` — every 15 seconds

### Message Deduplication
- Clients generate a UUID (`clientMessageId`) for each message before sending
- Both the REST endpoint and WebSocket handler check for existing messages with the same `clientMessageId + senderId + conversationId`
- A database unique constraint on `(sender_id, conversation_id, client_message_id)` provides an additional safety net
- If a duplicate is found, the existing message is returned without creating a new record

### Offline Message Queue
- Messages sent while the recipient is offline are stored in the database
- Push notifications alert offline users of new messages
- On reconnect, the client should call sync endpoints to retrieve missed messages
- The sync endpoint returns up to 500 messages per call, ordered by most recent first

---

## PWA Notes

The application is designed as a Progressive Web App:
- Service worker handles caching and offline detection
- Web App Manifest enables "Add to Home Screen" installation
- Push notification subscription persists across sessions
- Dark theme provides consistent native-app appearance
- Viewport meta tags handle safe areas on notched devices

---

## Push Notification Setup

1. Generate VAPID keys:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Set environment variables:
   ```
   VAPID_PUBLIC_KEY=<public key>
   VAPID_PRIVATE_KEY=<private key>
   VAPID_SUBJECT=mailto:you@example.com
   ```
3. The server automatically initializes VAPID on startup
4. If keys are not set, push notifications are silently disabled (server logs a warning)
5. Expired or invalid subscriptions (HTTP 410/404) are automatically deactivated

---

## Voice Call / WebRTC Notes

Voice calls use WebRTC for peer-to-peer audio:
- The server acts purely as a signaling relay (no media passes through the server)
- Call flow: `call_initiate` → `call_ringing` → `call_accept` → peer connection established
- ICE candidates, SDP offers, and answers are relayed through the WebSocket
- Call sessions are tracked in the database with status progression: ringing → active → ended/rejected
- If the receiver is offline, a push notification alerts them of the incoming call
- The caller and receiver are validated as conversation participants before any signaling occurs

For production deployment, you will need a TURN server for users behind restrictive NATs. Use an open-source TURN server like coturn, or a hosted service.

---

## File Storage Notes

### Upload Flow
1. Client sends file via multipart form to `POST /api/upload`
2. Server validates extension, MIME type, and file size
3. Filename is sanitized (special chars removed, unique suffix appended)
4. File is stored in object storage via presigned URL
5. An attachment record is created in the database
6. Client sends a message referencing the attachment ID

### Storage Backend
- Uses Google Cloud Storage. Configure with `GOOGLE_APPLICATION_CREDENTIALS` (path to a service account JSON key), `GCS_PROJECT_ID`, `PUBLIC_OBJECT_SEARCH_PATHS`, and `PRIVATE_OBJECT_DIR`.

### Limits
- Maximum file size: 25 MB
- Allowed types: JPEG, PNG, WebP, PDF, TXT, ZIP, DOC, DOCX
- Blocked: All executable extensions (.exe, .bat, .sh, .js, .dll, etc.)

---

## Security Notes

### Authentication
- Seed phrases are never stored — only SHA-256 hashes are persisted
- Session tokens are 48-byte random hex strings, stored as SHA-256 hashes
- Cookies are `httpOnly`, `secure` (in production), `sameSite: lax`, with 30-day expiry
- Sessions auto-renew within 7 days of expiration
- Logout revokes the session in the database

### File Security
- MIME type whitelist (8 types) and extension whitelist (9 extensions)
- Explicit blocklist for executable extensions (17 types)
- Filenames are sanitized: only `a-zA-Z0-9_-` characters, max 100 chars, with unique hex suffix
- Files served with `X-Content-Type-Options: nosniff`
- Non-image files served as `attachment` (forces download, prevents browser execution)
- Download access requires authentication and conversation membership

### Input Validation
- Wallet addresses validated against regex: `^0x[a-fA-F0-9]{40}$`
- Message types restricted to `text`, `image`, `file`
- All database queries use Drizzle ORM (parameterized, SQL-injection safe)
- Request body validation at each endpoint
- WebSocket payloads validated before processing

### CORS
- Configurable via `CORS_ORIGINS` environment variable
- In production without `CORS_ORIGINS`, cross-origin requests are blocked
- In development, all origins are allowed
- WebSocket CORS mirrors the HTTP CORS configuration

### Logging
- Pino logger redacts: `req.headers.authorization`, `req.headers.cookie`, `res.headers['set-cookie']`
- Seed phrases are never logged (only transmitted in the create response body)
- Structured JSON logging in production, pretty-printed in development

---

## Local Development Setup

### Prerequisites
- Node.js 24+
- pnpm 9+
- PostgreSQL 15+

### Steps

1. Clone the repository and install dependencies:
   ```bash
   pnpm install
   ```

2. Create a PostgreSQL database:
   ```bash
   createdb undernet
   ```

3. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your DATABASE_URL
   ```

4. Push the database schema:
   ```bash
   pnpm --filter @workspace/db run push
   ```

5. Build and start the server:
   ```bash
   pnpm --filter @workspace/api-server run dev
   ```

6. Verify:
   ```bash
   curl http://localhost:3001/api/healthz
   # → {"status":"ok"}
   ```

### Development Scripts

| Command | Description |
|---|---|
| `pnpm install` | Install all workspace dependencies |
| `pnpm run build` | Typecheck and build all packages |
| `pnpm run typecheck` | Run TypeScript type checking |
| `pnpm --filter @workspace/db run push` | Push schema changes to database |
| `pnpm --filter @workspace/api-server run dev` | Build and start API server |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate API client/schemas from OpenAPI |

---

## Troubleshooting

### Server won't start
- Verify `PORT` is set and not in use
- Verify `DATABASE_URL` is correct and PostgreSQL is running
- Check `pnpm --filter @workspace/db run push` has been run

### WebSocket connection fails
- Ensure `CORS_ORIGINS` includes your frontend's origin
- Check that the WebSocket path `/api/socket.io` is not blocked by a reverse proxy
- Verify Nginx/proxy is configured for WebSocket upgrade (see deployment guide)

### Push notifications not working
- Verify `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are set
- Check the server logs for "VAPID keys not configured" warning
- Ensure the client has granted notification permission
- Verify the subscription is active: `GET /api/notifications/status`

### File upload fails
- Check file size is under 25 MB
- Verify the file extension is in the allowed list
- Check object storage is configured (`PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR`)
- On self-hosted: ensure GCS credentials or compatible storage is configured

### Authentication issues
- Session cookies require `sameSite: lax` — ensure your frontend and API share the same top-level domain or are on the same origin
- In production, cookies require `secure: true` — HTTPS is mandatory
- Sessions expire after 30 days but auto-renew within the last 7 days

### Database issues
- Run `pnpm --filter @workspace/db run push` to ensure schema is up to date
- Use `pnpm --filter @workspace/db run push-force` to force push (destructive, use with caution)
- Check connection pool limits if experiencing timeouts under load
