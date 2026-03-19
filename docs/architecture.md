# Architecture

## Runtime

1. Electron main process starts local Express service on `127.0.0.1:4010`.
2. Next.js renderer communicates with the local service via HTTP.
3. Preload script exposes restricted IPC methods for auth, audio, and dossier operations.
4. Preload IPC can surface read-only media permission state so renderer UI can gate capture flows without direct Electron access.
5. Interview transcription pipeline opens an OpenAI Realtime websocket per active interview and appends completed transcript segments into local interview storage.

## Data Flow

1. Interview transcript/integration payload enters signal ingestion.
2. Optional integration sync worker pulls Slack/Linear/PostHog records via provider APIs and normalizes to canonical signals.
3. Signal normalization -> classification -> dedupe -> persistence.
4. Embeddings stored for deterministic local clustering.
5. Ghost feature scanner groups related signals (>=3).
6. Dossier pipeline generates 9 sections with evidence citations.
7. Export service outputs markdown/json and optionally pushes to Linear/Jira.

## Interview Transcription

- `POST /v1/interviews/:id/transcription/start` opens a realtime transcription session using OpenAI key from Keychain.
- `POST /v1/interviews/:id/transcription/chunk` streams base64 PCM16 audio chunks (mono) into the realtime session.
- `POST /v1/interviews/:id/transcription/stop` finalizes realtime and falls back to Whisper (`/v1/audio/transcriptions`) when no realtime transcript is emitted.
- Meeting foundation persists local meeting metadata, linked calendar metadata, local notes, and transcription session refs, but does not yet start an independent meeting capture flow.

## Security Defaults

- Keychain-backed provider and integration secrets.
- OAuth loopback auth exchanges authorization codes for provider access/refresh tokens before persisting to Keychain.
- Consent required before interview capture starts.
- Meeting capture requires explicit user action before capture starts.
- macOS permission state is surfaced to the UI, but app-level consent remains mandatory even when OS permission is already granted.
- Only local meeting metadata, local notes, transcription refs, and normalized calendar metadata are stored in this phase.
- No hidden background meeting recording or background Google sync runs in this phase.
- Redaction pass before export for obvious API keys/PII.
- Local DB key is sourced from Keychain and applied via SQLCipher-compatible cipher pragmas (`cipher` + `key`) at startup (`SCOPE_DB_ENCRYPTION_REQUIRED=true` to fail hard without cipher support).
- Outbound egress guard for known allowlisted hosts.

## Hardening

- Pre-migration DB backups are created with `VACUUM INTO` before applying new SQL migrations.
- Local service health endpoint includes uptime, active request count, and integration sync status snapshot.
- Integration sync has in-flight dedupe and retry for transient network failures (`429` / `5xx`).
- Desktop process writes structured logs to local files and captures uncaught errors/rejections.
- Support diagnostics endpoint packages health snapshot + recent logs and can POST bundles to a support webhook.
- Diagnostics send endpoint enforces local rate limits and request-size caps before forwarding.
- Diagnostics webhook delivery can include bearer auth and HMAC signature headers for receiver verification.
