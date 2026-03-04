# Scope (Arena-Equivalent macOS App)

White-labeled Arena-equivalent desktop app built with:
- Electron desktop shell
- Next.js renderer
- Local Node/Express orchestration service
- SQLite local-first storage (with FTS + embeddings table)
- BYOK key management in macOS Keychain

## Monorepo Layout

- `apps/desktop`: Electron app, IPC bridge, local service
- `apps/renderer`: Next.js UI
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
- Transcript append + follow-up generation + 7-section debrief
- Signal ingestion, classification, dedupe, confidence scoring
- Ghost feature clustering (3+ signals)
- 4-step dossier generation pipeline (Researcher -> Analyst -> Writer -> Critic)
- Markdown/JSON dossier export and Linear/Jira push adapters

## API Endpoints

- `POST /v1/interviews/start`
- `POST /v1/interviews/:id/stop`
- `GET /v1/interviews/:id/transcript`
- `POST /v1/signals/ingest`
- `GET /v1/signals/stream`
- `POST /v1/features/ghost/scan`
- `POST /v1/dossiers/generate`
- `GET /v1/dossiers/:id`
- `POST /v1/export/linear`
- `POST /v1/export/jira`
- `POST /v1/export/dossier` (local markdown/json serialization)

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
npm run start -w apps/desktop
```

## Test

```bash
npm test
```

## Notes

- PostHog integration uses API key mode in this implementation.
- Linear/Jira export requires credentials (stored via keychain or request payload).
- Audio capture IPC is implemented as local dual-capture session control scaffold; media transport wiring can be extended in Phase 1 hardening.
