import type { TranscriptSegment } from "@scope/types";
import type { Express } from "express";
import type { CoreServices } from "@scope/core";
import type { OpenAIRealtimeTranscription } from "../../transcription";
import type { AppLogger } from "../../telemetry/logger";

interface MeetingRouteDeps {
  services: CoreServices;
  transcription: OpenAIRealtimeTranscription;
  logger?: AppLogger;
}

const isNotFoundError = (error: unknown) => (error as Error).message === "Meeting session not found.";

export const registerMeetingRoutes = (app: Express, deps: MeetingRouteDeps) => {
  const { services, transcription, logger } = deps;

  app.post("/v1/meetings/start", (_req, res) => {
    try {
      const session = services.meetingService.start();
      res.status(201).json(session);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/v1/meetings/:id/transcript", (req, res) => {
    try {
      const segments = (req.body?.segments ?? []) as TranscriptSegment[];
      const result = services.meetingService.appendTranscript(req.params.id, segments);
      services.signalService.ingestTranscriptSegments({
        source: "meeting",
        sessionId: req.params.id,
        segments
      });
      res.status(200).json(result);
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  });

  app.post("/v1/meetings/:id/stop", async (req, res) => {
    try {
      try {
        await transcription.stop(req.params.id);
      } catch (error) {
        logger?.warn("Stopping transcription failed before meeting stop", { error });
      }
      const session = await services.meetingService.stop(req.params.id);
      res.status(200).json(session);
    } catch (error) {
      res.status(isNotFoundError(error) ? 404 : 500).json({ error: (error as Error).message });
    }
  });

  app.get("/v1/meetings/:id", (req, res) => {
    try {
      const meeting = services.meetingService.get(req.params.id);
      res.status(200).json(meeting);
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  });

  app.get("/v1/meetings", (_req, res) => {
    try {
      res.status(200).json({ items: services.meetingService.list() });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
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
      res.status(isNotFoundError(error) ? 404 : 400).json({ error: (error as Error).message });
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
      const meeting = services.meetingService.get(req.params.id);
      services.signalService.ingestTranscriptSegments({
        source: "meeting",
        sessionId: req.params.id,
        segments: meeting.transcriptSegments
      });
      res.status(200).json({
        ...result,
        meeting
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });
};
