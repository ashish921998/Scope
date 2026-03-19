# Support Diagnostics Webhook Verification

This app can send diagnostics bundles to `SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_URL`.

## Optional security controls

Set in the desktop app environment:

- `SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_AUTH_TOKEN`
- `SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_SIGNING_SECRET`

When set, the sender includes:

- `Authorization: Bearer <token>`
- `X-Scope-Signature-Timestamp: <unix-ms>`
- `X-Scope-Signature: sha256=<hmac>`

HMAC payload format:

- `HMAC_SHA256(signingSecret, "<timestamp>.<raw_json_body>")`

## Receiver implementation

Use:

- [support-webhook-server.ts](/Users/ashishhuddar/Desktop/Scope/docs/examples/support-webhook-server.ts)

Key receiver requirements:

1. Verify bearer token if configured.
2. Verify HMAC signature against raw request body.
3. Reject stale timestamps (recommended 5-minute window).
4. Reject replayed signatures within the timestamp tolerance window.
5. Return JSON with a stable ID (`ticketId`, `referenceId`, or `id`) so the app can show a support reference.

## Replay protection

The included example uses an in-memory replay store keyed by:

- `<timestamp>:<signature>`

This is acceptable for a single-process local receiver or a simple internal service. For production, use a shared TTL-backed store such as Redis or Postgres so duplicate deliveries are rejected across:

- multiple app instances
- restarts
- rolling deploys

Receiver rule:

- accept first-seen `(timestamp, signature)`
- reject duplicates with `409 replayed`
- expire seen keys after the same window used for timestamp tolerance

## Local test flow

1. Run receiver:
```bash
PORT=8787 \
SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_AUTH_TOKEN=local-token \
SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_SIGNING_SECRET=local-secret \
node docs/examples/support-webhook-server.ts
```

2. Run desktop app with:
```bash
SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_URL=http://127.0.0.1:8787/diagnostics \
SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_AUTH_TOKEN=local-token \
SCOPE_SUPPORT_DIAGNOSTICS_WEBHOOK_SIGNING_SECRET=local-secret \
npm run start -w apps/desktop
```

3. In UI, click `Send Diagnostics` and confirm the returned reference appears.
