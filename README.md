# Scope (Arena-Equivalent macOS App)

White-labeled Arena-equivalent desktop app built with:
- Electron desktop shell
- Next.js renderer
- Local Node/Express orchestration service
- SQLite local-first storage (with FTS + embeddings table)
- Encrypted local SQLite storage via `better-sqlite3-multiple-ciphers` (SQLCipher mode)
- BYOK key management in macOS Keychain

## Monorepo Layout

- `apps/desktop`: Electron app, IPC bridge, local service
- `apps/renderer`: Next.js UI
- `apps/website`: Public marketing site, pricing, privacy, and download pages
- `packages/core`: Domain logic (signals, ghost features, dossiers, exports)
- `packages/types`: Shared domain types/contracts
- `tests`: Unit, integration, and e2e tests

## Implemented Milestone Coverage

### Phase 0 Foundation
- Workspace setup
- Secure Electron preload API + IPC handlers
- Local service with required endpoints
- SQLite migrations and schema
- Keychain storage for provider and integration secrets
- OAuth callback loopback implementation (`http://127.0.0.1:<port>/oauth/callback`)

### Phase 1 Core Loop
- Interview session start/stop with consent gate
- Realtime transcript streaming (OpenAI Realtime) with Whisper fallback, plus follow-up generation + 7-section debrief
- Signal ingestion, classification, dedupe, confidence scoring
- Ghost feature clustering (3+ signals)
- 4-step dossier generation pipeline (Researcher -> Analyst -> Writer -> Critic)
- Markdown/JSON dossier export and Linear/Jira push adapters

## API Endpoints

- `POST /v1/interviews/start`
- `POST /v1/interviews/:id/transcription/start`
- `POST /v1/interviews/:id/transcription/chunk`
- `POST /v1/interviews/:id/transcription/stop`
- `POST /v1/interviews/:id/stop`
- `GET /v1/interviews/:id/transcript`
- `POST /v1/signals/ingest`
- `POST /v1/integrations/sync` (Slack + Linear + PostHog pull sync)
- `GET /v1/signals/stream`
- `POST /v1/features/ghost/scan`
- `POST /v1/dossiers/generate`
- `GET /v1/dossiers/:id`
- `POST /v1/export/linear`
- `POST /v1/export/jira`
- `POST /v1/export/dossier` (local markdown/json serialization)
- `POST /v1/auth/integration/refresh`
- `GET /v1/support/diagnostics`
- `POST /v1/support/diagnostics/send`

## IPC Contracts

- `auth/connectIntegration(provider)`
- `audio/startCapture(sessionId, micDeviceId, systemAudio = true)`
- `audio/stopCapture(sessionId)`
- `keys/saveProviderKey(provider, keyRef)`
- `dossier/generate(featureId)`
- `export/dossier(featureId, format)`

## Install and Run

```bash
npm install
npm run build
npm run dev:renderer
npm run dev:website
npm run start -w apps/desktop
```

## Test

```bash
npm test
```

## Release

Prepare a notarized macOS build and smoke-test the packaged app:

```bash
npm run release:mac
```

Useful commands:

```bash
npm run dist:mac
npm run smoke:packaged
```

Release environment:

- Signing:
  - `CSC_LINK`
  - `CSC_KEY_PASSWORD`
- Notarization via Apple ID:
  - `APPLE_ID`
  - `APPLE_APP_SPECIFIC_PASSWORD`
  - `APPLE_TEAM_ID`
- Notarization via App Store Connect API key:
  - `APPLE_API_KEY`
  - `APPLE_API_KEY_ID`
  - `APPLE_API_ISSUER`
- Smoke test:
  - `SCOPE_SMOKE_APP_PATH=/absolute/path/to/Scope.app`
  - `SCOPE_SMOKE_PORT=4310`

## Notes

- PostHog integration uses API key mode in this implementation.
- Packaged desktop builds load the statically exported renderer from `apps/desktop/dist/renderer`.
- OAuth connect now completes loopback callback + provider token exchange and stores tokens in Keychain.
- Integration sync pulls Slack/Linear/PostHog events and ingests canonical signals into the local stream.
- Interview transcript append/realtime-stop auto-ingests interview signals (in addition to transcript persistence).
- `SCOPE_DB_ENCRYPTION_REQUIRED=true` enforces SQLCipher-compatible cipher support for encrypted local DB startup.
- `SCOPE_DB_CIPHER=sqlcipher` controls the cipher mode (defaults to `sqlcipher`).
- `SCOPE_LOCAL_SERVICE_PORT` overrides the desktop local service port (used by packaged smoke tests).
- `SCOPE_DB_BACKUP_BEFORE_MIGRATION=false` disables pre-migration `VACUUM INTO` backups (enabled by default).
- `SCOPE_INTEGRATIONS_AUTO_SYNC_SECONDS=<n>` runs background integration sync on interval.
- Structured runtime logs are written under Electron `userData/logs/`.
- Optional Sentry forwarding:
  - `SENTRY_DSN=<dsn>`
  - `SENTRY_ENVIRONMENT=development|staging|production`
  - `SENTRY_TRACES_SAMPLE_RATE=0.0..1.0`
- Support diagnostics webhook:
  - `SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_URL=https://...`
  - If webhook returns `ticketId`/`referenceId`/`id`, it is surfaced in diagnostics send response/UI.
  - `SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_AUTH_TOKEN=<token>` adds `Authorization: Bearer ...`.
  - `SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_SIGNING_SECRET=<secret>` adds HMAC SHA256 signature headers.
  - `SCOPE_SUPPORT_SEND_RATE_LIMIT_MAX=5` and `SCOPE_SUPPORT_SEND_RATE_LIMIT_WINDOW_MS=60000` rate-limit local send attempts.
  - `SCOPE_SUPPORT_MAX_REQUEST_BYTES=32768` caps diagnostics send request payload size.
  - Receiver verification guide: [support-webhook-verification.md](/Users/ashishhuddar/Desktop/Scope/docs/support-webhook-verification.md)
- The public website is a separate deployable Next.js app inside the monorepo so marketing, pricing, privacy, and release download pages stay versioned with the product.
- Linear/Jira export requires credentials (stored via keychain or request payload).
- Audio capture IPC is implemented as local dual-capture session control scaffold; media transport wiring can be extended in Phase 1 hardening.
