import type { MeetingTranscriptSegment, TranscriptSegment } from "@scope/types";
import type { Express } from "express";
import type { CoreServices } from "@scope/core";
import type { OpenAIRealtimeTranscription } from "../../transcription";
import type { AppLogger } from "../../telemetry/logger";

interface MeetingRouteDeps {
  services: CoreServices;
  transcription: OpenAIRealtimeTranscription;
  logger?: AppLogger;
}

const toMeetingSegments = (segments: TranscriptSegment[]): MeetingTranscriptSegment[] =>
  segments.map((segment) => ({
    id: segment.id,
    speaker: segment.speaker,
    text: segment.text,
    timestampMs: segment.timestampMs,
    source: segment.speaker === "system" ? "system" : "mic"
  }));

const ingestMeetingSegments = (services: CoreServices, meetingId: string, segments: MeetingTranscriptSegment[]) => {
  for (const segment of segments) {
    services.signalService.ingest({
      source: "meeting",
      sourceRef: `${meetingId}:${segment.id}`,
      text: segment.text,
      evidenceKind: "transcript",
      evidenceUri: `meeting://${meetingId}/segment/${segment.id}`,
      timestampMs: segment.timestampMs
    });
  }
};

export const registerMeetingRoutes = (app: Express, deps: MeetingRouteDeps) => {
  const { services, transcription, logger } = deps;

  app.post("/v1/meetings/start", (req, res) => {
    try {
      const consentAccepted = Boolean(req.body?.consentAccepted);
      const title = typeof req.body?.title === "string" && req.body.title.trim().length > 0 ? req.body.title.trim() : undefined;
      const session = services.meetingService.start(consentAccepted, title);
      res.status(201).json(session);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.get("/v1/meetings", (req, res) => {
    try {
      const limit = Number(req.query.limit ?? "5");
      res.status(200).json({
        items: services.meetingService.listRecent(Number.isFinite(limit) ? limit : 5)
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.get("/v1/meetings/:id", (req, res) => {
    try {
      res.status(200).json(services.meetingService.get(req.params.id));
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  });

  app.get("/v1/meetings/:id/transcript", (req, res) => {
    try {
      res.status(200).json(services.meetingService.getTranscript(req.params.id));
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  });

  app.post("/v1/meetings/:id/transcription/start", async (req, res) => {
    try {
      services.meetingService.get(req.params.id);
      const started = await transcription.start(req.params.id, {
        realtimeModel: req.body?.realtimeModel,
        fallbackModel: req.body?.fallbackModel,
        language: req.body?.language,
        sampleRateHz: req.body?.sampleRateHz
      });
      res.status(200).json(started);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/v1/meetings/:id/transcription/chunk", async (req, res) => {
    try {
      const result = await transcription.appendAudio(req.params.id, {
        audioBase64: req.body?.audioBase64,
        speaker: req.body?.speaker,
        sampleRateHz: req.body?.sampleRateHz
      });
      res.status(202).json(result);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/v1/meetings/:id/transcription/stop", async (req, res) => {
    try {
      const result = await transcription.stop(req.params.id);
      const transcript = services.meetingService.getTranscript(req.params.id);
      ingestMeetingSegments(services, req.params.id, transcript.transcriptSegments);
      const meeting = services.meetingService.stop(req.params.id);
      res.status(200).json({
        ...result,
        transcript,
        meeting
      });
    } catch (error) {
      logger?.warn("Meeting transcription stop failed", { error });
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/v1/meetings/:id/transcript", (req, res) => {
    try {
      const segments = (req.body?.segments ?? []) as MeetingTranscriptSegment[];
      const result = services.meetingService.appendTranscript(req.params.id, segments);
      ingestMeetingSegments(services, req.params.id, segments);
      res.status(200).json(result);
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  });
};
