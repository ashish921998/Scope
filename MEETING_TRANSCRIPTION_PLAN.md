# Meeting Transcription for Scope Desktop — Full Gong-Style

## Context

The Scope desktop Mac app (`/Users/ashishhuddar/Desktop/Scope/`) already has an interview transcription pipeline: OpenAI Realtime WebSocket, Whisper fallback, dual-stream audio scaffolding, signal ingestion, and a 4-stage dossier pipeline. The goal is to build a Granola/Gong-like meeting transcription experience that detects likely meetings, captures system audio natively, transcribes with usable speaker separation, generates AI meeting notes, feeds into the signal pipeline, and syncs to the ScopePM web app.

The original direction is good, but v1 needs tighter guarantees. The plan below keeps the same product ambition while narrowing the first release to behavior that is technically reliable in the current architecture.

## User Choices
- **Scope**: Full Gong-style direction (meeting prompts, calendar context, overlay, web sync)
- **Audio**: Native macOS ScreenCaptureKit for system audio capture
- **Signals**: Meeting transcripts feed into the existing signal pipeline
- **Speakers**: V1 uses deterministic `"me"` attribution plus anonymous remote diarization

## V1 Product Contract

These are the promises the first implementation can safely make:

- Local mic audio is labeled as `"me"`.
- System audio is captured separately from mic audio.
- Remote speakers may be diarized as anonymous labels like `speaker_0`, `speaker_1`.
- V1 does not promise reliable named-speaker identity from mixed meeting audio alone.
- Meeting detection is confidence-based and prompt-driven, not fully automatic.
- Recording starts only after explicit user confirmation.

---

## Phase 0: Foundation (Types, Schema, Permissions, Privacy)

### 0.1 Fix macOS Entitlements

**File:** `apps/desktop/build/entitlements.mac.plist`

Add missing permissions:
```xml
<key>com.apple.security.device.audio-input</key>
<true/>
<key>com.apple.security.device.screen-capture</key>
<true/>
```

**File:** `apps/desktop/electron-builder.yml`

Add under `mac:`:
```yaml
extendInfo:
  NSMicrophoneUsageDescription: "Scope needs microphone access to record and transcribe meetings."
  NSScreenCaptureUsageDescription: "Scope needs screen and system audio capture permission to transcribe meetings."
```

### 0.2 Add Runtime Permission Flow

Entitlements are not enough. The app must explicitly handle first-run permission prompts and denial states.

**New file:** `apps/desktop/src/permissions/mediaPermissions.ts`

Responsibilities:
- Check microphone permission status
- Check screen/system capture permission status
- Expose `granted | denied | not-determined | restricted` style status to the renderer
- Provide a recovery path when permission is denied

### 0.3 Extend Type System

**File:** `packages/types/src/index.ts`

Add and update types:
- `MeetingSpeaker` — `"me" | "system" | string`
- `MeetingTranscriptSegment` — `{ id, speaker, text, timestampMs, confidence?, source: "mic" | "system" }`
- `MeetingParticipant` — `{ id, name, email?, role? }`
- `MeetingActionItem` — `{ text, assignee?: string, sourceSegmentIds?: string[] }`
- `MeetingNotes` — `{ summary, keyDecisions: string[], actionItems: MeetingActionItem[], topics: string[], followUps: string[], sentiment?: string }`
- `MeetingSession` — `{ id, title, status, platform?, startedAt, endedAt?, participants, transcriptSegments, notes?, calendarEventId?, durationMs? }`
- Extend `SignalSource` union to include `"meeting"`
- Add `ProviderKeyName = "openai" | "anthropic" | "deepgram"`
- Add `"google"` to `IntegrationProvider`
- Add a shared transcription session ref:
  ```ts
  type TranscriptionSessionRef = { id: string; kind: "interview" | "meeting" }
  ```

Important modeling rule:
- `IntegrationProvider` is for OAuth/data integrations
- `ProviderKeyName` is for API-key based model providers

### 0.4 Database Migration

**New file:** `packages/core/src/migrations/002_meetings.sql`

```sql
CREATE TABLE meetings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  platform TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  participants_json TEXT NOT NULL DEFAULT '[]',
  transcript_json TEXT NOT NULL DEFAULT '[]',
  notes_json TEXT,
  calendar_event_id TEXT,
  duration_ms INTEGER
);
CREATE INDEX idx_meetings_status ON meetings(status);
CREATE INDEX idx_meetings_started_at ON meetings(started_at);

CREATE TABLE calendar_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  participants_json TEXT NOT NULL DEFAULT '[]',
  payload_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_calendar_events_starts_at ON calendar_events(starts_at);
```

Migration system in `packages/core/src/db/client.ts` auto-discovers numbered `.sql` files.

### 0.5 Meeting Repository

**New file:** `packages/core/src/db/meetingRepo.ts`

Follow `interviewRepo.ts` pattern. Methods:
- `create`
- `get`
- `list`
- `updateTranscript`
- `updateNotes`
- `complete`

**Optional new file:** `packages/core/src/db/calendarEventRepo.ts`

Methods:
- `upsertMany`
- `listUpcoming`
- `findLikelyMatch`

### 0.6 Wire Into Core

**Modify:** `packages/core/src/app.ts`
- add `MeetingRepo` + `MeetingService` to `CoreServices`

**Modify:** `packages/core/src/index.ts`
- export meeting modules

### 0.7 Privacy and Consent Requirements

Before any capture starts:
- user must explicitly confirm recording
- UI must show clear recording state
- each meeting must have an obvious stop action
- transcript retention behavior must be documented
- ScopePM sync must be opt-in per user or per workspace

This is a product requirement, not a follow-up.

---

## Phase 1: Native Audio Capture (ScreenCaptureKit)

### 1.1 Swift Helper Binary

**New directory:** `apps/desktop/src/audio/native/`

**New file:** `apps/desktop/src/audio/native/ScopeAudioCapture.swift`

A standalone Swift CLI that uses `ScreenCaptureKit` (macOS 13+) to capture system audio:
- uses `SCStreamConfiguration` with audio capture enabled
- excludes current-process audio when possible
- outputs PCM16 mono 24kHz to stdout
- accepts commands via stdin: `start`, `stop`
- is responsible only for system audio capture, not mic capture

**New file:** `apps/desktop/src/audio/native/build.sh`

Compile script:
```bash
swiftc -framework ScreenCaptureKit -framework CoreAudio -o scope-audio-helper ScopeAudioCapture.swift
```

**Modify:** `apps/desktop/electron-builder.yml`

Bundle `scope-audio-helper` binary as an extra resource:
```yaml
extraResources:
  - from: src/audio/native/scope-audio-helper
    to: scope-audio-helper
```

### 1.2 Native Audio Bridge (Node ↔ Swift)

**New file:** `apps/desktop/src/audio/nativeCapture.ts`

Spawns the Swift helper via `execFile`, pipes PCM16 from stdout:
- `startSystemCapture(): ReadableStream<Buffer>`
- `stopSystemCapture()`
- converts raw PCM16 buffers to base64 chunks for transcription
- tags chunks with `source: "system"`

### 1.3 Keep Mic and System Audio as Separate Logical Inputs

**Modify:** `apps/desktop/src/audio/captureService.ts`

Responsibilities:
- mic audio remains captured from the renderer AudioWorklet path
- system audio comes from the native Swift helper
- the service manages both inputs as one meeting capture session
- the service does not downmix away source identity before transcription

### 1.4 V1 Speaker Strategy

V1 does not rely on “full diarization from one mixed stream”.

Instead:
- mic-origin transcript segments are labeled `"me"`
- system-origin transcript segments may be diarized into `speaker_0`, `speaker_1`, etc.
- named participant mapping is best-effort and optional

If Deepgram cannot reliably diarize the system stream in real time, the fallback is:
- label all system audio as `"speaker_remote"`
- preserve transcript quality over false speaker precision

---

## Phase 2: Transcription Providers and Session Routing

### 2.1 Deepgram Streaming Provider

**New file:** `apps/desktop/src/transcription/deepgramTranscription.ts`

WebSocket client to `wss://api.deepgram.com/v1/listen` with meeting-oriented config:
- diarization enabled for system audio
- `encoding=linear16`
- `sample_rate=24000`
- `channels=1`
- punctuation enabled
- interim results enabled

The provider should operate on an explicit session ref, not just a raw id:
- `start(ref, config)`
- `appendAudio(ref, chunk)`
- `stop(ref)`

### 2.2 Generalize the Transcription Interface

**Modify:** `apps/desktop/src/transcription/index.ts`

Create a shared interface for providers:
```ts
interface TranscriptionProvider {
  start(ref: TranscriptionSessionRef, options?: object): Promise<unknown>
  appendAudio(ref: TranscriptionSessionRef, input: AudioChunkInput): Promise<unknown>
  stop(ref: TranscriptionSessionRef): Promise<unknown>
  shutdown(): Promise<void>
}
```

Export a factory:
```ts
function createTranscriptionProvider(kind: "openai" | "deepgram")
```

Default behavior:
- interviews use OpenAI
- meetings use Deepgram

### 2.3 Fix Callback Routing

**Modify:** `apps/desktop/src/service/server.ts`

Replace existence-based routing with explicit typed routing:
```ts
onTranscriptSegments: (ref, segments) => {
  if (ref.kind === "meeting") {
    services.meetingService.appendTranscript(ref.id, segments)
  } else {
    services.interviewService.appendTranscript(ref.id, segments)
  }
}
```

Do not infer session type by checking repository existence.

### 2.4 Keychain + Egress Updates

**Modify:** `apps/desktop/src/security/keychain.ts`
- replace hardcoded `"openai" | "anthropic"` with `ProviderKeyName`

**Modify:** `apps/desktop/src/ipc/registerIpc.ts`
- allow saving Deepgram provider keys through the existing key flow

**Modify:** `packages/core/src/security/egress.ts`
- add `"api.deepgram.com"`

---

## Phase 3: Meeting Service + AI Notes

### 3.1 Meeting Service

**New file:** `packages/core/src/meetings/service.ts`

Mirrors `interviews/service.ts` but with meeting-specific behavior:
- `start(title, platform?, calendarEventId?)`
- `appendTranscript(meetingId, segments)`
- `stop(meetingId)`
- `generateNotes(meetingId)`
- `get(meetingId)`
- `list(limit?)`

It should:
- merge segments by timestamp
- preserve source metadata
- avoid duplicate segment ids
- run notes generation after stop

### 3.2 AI Meeting Notes Pipeline

**New file:** `packages/core/src/meetings/notesPipeline.ts`

Reuse `callAnthropic` patterns from dossier generation.

Stage 1:
- summarize transcript into structured `MeetingNotes`

Stage 2:
- extract decisions, action items, follow-ups

V1 assignment rule:
- only assign `"me"` confidently
- remote assignees stay anonymous unless matched from metadata

Deterministic fallback:
- keyword-based extraction similar to `buildDebrief`
- should produce stable JSON even without API keys

### 3.3 Meeting API Routes

**New file:** `apps/desktop/src/service/routes/meetings.ts`

```
POST   /v1/meetings/start
GET    /v1/meetings
GET    /v1/meetings/:id
POST   /v1/meetings/:id/transcript
POST   /v1/meetings/:id/stop
POST   /v1/meetings/:id/transcription/start
POST   /v1/meetings/:id/transcription/chunk
POST   /v1/meetings/:id/transcription/stop
GET    /v1/meetings/:id/notes
POST   /v1/meetings/:id/notes/regenerate
```

### 3.4 Signal Pipeline Integration

**Modify:** `packages/core/src/signals/service.ts`

- add `"meeting"` to `inferEvidenceKind` mapping to `"transcript"`
- ingest meeting transcript segments as signals with source `"meeting"`
- preserve meeting segment timestamps and evidence URIs

---

## Phase 4: Meeting Detection and Calendar Context

### 4.1 Reframe Detection as Confidence-Based

V1 should not claim full automatic meeting detection.

Instead, build a “meeting likely active” signal from:
- native app process detection for Zoom and Teams
- calendar events happening now or soon
- optional browser/activity heuristics

The output is:
- `low | medium | high` meeting confidence
- a suggested meeting title/platform

### 4.2 Process Watcher

**New file:** `apps/desktop/src/meetings/processWatcher.ts`

Polls every 5 seconds using `execFile`:
- detect Zoom native process
- detect Teams native process
- optionally detect browser process presence, but do not treat it as reliable Google Meet detection alone

Expose an EventEmitter:
- `confidence-changed`
- `platform-detected`

### 4.3 Google Calendar Integration

**New file:** `apps/desktop/src/meetings/calendarSync.ts`

- fetch upcoming events via Google Calendar REST API
- store locally in `calendar_events`
- match probable meetings by time window

**Modify:** `apps/desktop/src/auth/oauth.ts`
- add Google OAuth2 flow
- scope: `https://www.googleapis.com/auth/calendar.readonly`

**Modify:** `packages/core/src/security/egress.ts`
- add `googleapis.com`
- add `accounts.google.com`
- add `oauth2.googleapis.com`

### 4.4 Floating Overlay Window

**New file:** `apps/desktop/src/windows/overlayWindow.ts`

Second `BrowserWindow`:
```ts
alwaysOnTop: true,
frame: false,
transparent: true,
width: 360,
height: 480,
skipTaskbar: true
```

Shows:
- live transcript
- meeting timer
- recording state
- stop button

### 4.5 Prompt-to-Start Flow

**Modify:** `apps/desktop/src/main.ts`

Flow:
1. process watcher emits confidence update
2. calendar sync finds a likely matching event
3. app shows a prompt like: `Detected likely meeting: Sprint Planning. Start recording?`
4. only after explicit confirmation does the app start capture and open overlay

This is deliberate. V1 should optimize for trust and correctness, not invisible auto-recording.

---

## Phase 5: Meeting UI

### 5.1 Meeting Card Component

**New file:** `apps/renderer/components/MeetingCard.tsx`

- title input with calendar autofill
- platform badge
- start/stop button with recording state
- live transcript with speaker labels and timestamps
- notes view after stop
- notes regenerate button
- sync/export control

### 5.2 Meeting List View

**Modify:** `apps/renderer/app/page.tsx`

- add `MeetingCard` alongside `InterviewCard`
- show recent meetings with title, platform, duration, date
- allow opening transcript + notes

### 5.3 IPC Bridge

**Modify:** `apps/desktop/src/preload.ts`
- add meeting IPC methods

**Modify:** `apps/renderer/types/scope.d.ts`
- add type declarations

**Modify:** `apps/desktop/src/ipc/registerIpc.ts`
- add meeting IPC handlers

### 5.4 Permission and Consent UI

The renderer must expose:
- microphone permission state
- screen/system capture permission state
- clear consent confirmation before recording
- a visible “recording now” state while capture is active

---

## Phase 6: Web Sync (ScopePM Integration)

### 6.1 Sync Service (Desktop Side)

**New file:** `apps/desktop/src/meetings/webSync.ts`

Pushes meeting data to ScopePM API:
- sends transcript + notes after meeting ends
- maps meeting to a ScopePM project
- uses a ScopePM auth token stored in Keychain

Sync should be:
- disabled by default until user configures it
- retry-safe and idempotent

### 6.2 ScopePM API Endpoints (Web Side)

**New file:** `/Users/ashishhuddar/scopepm/packages/api/src/routes/meetings.ts`

```
POST   /api/meetings
GET    /api/meetings
GET    /api/meetings/:id
```

**Modify:** `/Users/ashishhuddar/scopepm/packages/api/src/db/schema.ts`
- add meeting table(s)

**Modify:** `/Users/ashishhuddar/scopepm/packages/api/src/index.ts`
- register meeting routes

### 6.3 Web UI for Meetings

**New file:** `/Users/ashishhuddar/scopepm/packages/web/app/routes/dashboard/meetings.tsx`

Meeting list and detail view following existing ScopePM design patterns.

---

## Implementation Order

```txt
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6
Foundation  Audio     Providers Service   Detection  UI        Web Sync
```

Phases 0-3 are the functional core.

V1 release gate:
- permission flow works
- user-confirmed capture works
- separate mic/system pipeline works
- meeting notes work
- meeting signals ingest correctly

Phases 4-6 complete the broader Gong-style product experience.

---

## Key Files to Reuse

| File | What to Reuse |
|------|---------------|
| `apps/desktop/src/transcription/openaiRealtimeTranscription.ts` | Session lifecycle, WebSocket patterns, fallback buffering |
| `packages/core/src/dossier/pipeline.ts` | `callAnthropic` pattern, JSON parsing, fallback structure |
| `packages/core/src/interviews/service.ts` | Session lifecycle, transcript append pattern |
| `packages/core/src/db/interviewRepo.ts` | Repository pattern, prepared statements, JSON columns |
| `apps/renderer/lib/audio.ts` | PCM/base64 conversion helpers |
| `apps/renderer/components/InterviewCard.tsx` | AudioWorklet setup, mic capture flow |
| `apps/desktop/src/auth/oauth.ts` | Existing OAuth flow structure |
| `apps/desktop/src/integrations/syncService.ts` | Background sync pattern |

---

## Verification

| Phase | Test |
|-------|------|
| 0 | Migration applies cleanly. Provider types compile cleanly. Permission states are surfaced to UI. |
| 1 | `swiftc` compiles helper. Helper captures system audio standalone. Mic and system inputs remain separately tagged. |
| 2 | Unit test: mock provider callbacks and verify transcript routing by `ref.kind`. Unit test: Deepgram provider handles diarized system segments. |
| 3 | Integration test: meeting start → transcript append → stop → notes generated → signals ingested. |
| 4 | Unit test: process watcher and calendar matcher produce confidence levels. Manual: likely meeting prompt appears, but recording does not start without confirmation. |
| 5 | Manual: full Electron flow with permission gating, visible recording state, live transcript, and post-meeting notes. |
| 6 | Integration test: desktop meeting sync is idempotent. Manual: synced meeting appears in ScopePM dashboard. |
