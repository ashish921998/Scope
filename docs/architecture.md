# Architecture

## Runtime

1. Electron main process starts local Express service on `127.0.0.1:4010`.
2. Next.js renderer communicates with the local service via HTTP.
3. Preload script exposes restricted IPC methods for auth, audio, and dossier operations.

## Data Flow

1. Interview transcript/integration payload enters signal ingestion.
2. Signal normalization -> classification -> dedupe -> persistence.
3. Embeddings stored for deterministic local clustering.
4. Ghost feature scanner groups related signals (>=3).
5. Dossier pipeline generates 9 sections with evidence citations.
6. Export service outputs markdown/json and optionally pushes to Linear/Jira.

## Security Defaults

- Keychain-backed provider and integration secrets.
- Consent required before interview capture starts.
- Redaction pass before export for obvious API keys/PII.
- Outbound egress guard for known allowlisted hosts.
