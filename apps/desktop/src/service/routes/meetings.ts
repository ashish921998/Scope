import type { MeetingParticipant, TranscriptSegment } from "@scope/types";
import type { Express } from "express";
import type { CoreServices } from "@scope/core";
import type { TranscriptionProvider } from "../../transcription";
import type { AppLogger } from "../../telemetry/logger";

interface MeetingRouteDeps {
  services: CoreServices;
  transcription: TranscriptionProvider;
  logger?: AppLogger;
}

export const registerMeetingRoutes = (app: Express, deps: MeetingRouteDeps) => {
  const { services, transcription, logger } = deps;

  app.post("/v1/meetings/start", (req, res) => {
    try {
      const participants = Array.isArray(req.body?.participants)
        ? (req.body.participants as MeetingParticipant[])
        : undefined;
      const session = services.meetingService.start({
        title: req.body?.title,
        platform: req.body?.platform,
        participants,
        calendarEventId: req.body?.calendarEventId
      });
      res.status(201).json(session);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/v1/meetings/:id/transcript", (req, res) => {
    try {
      const segments = (req.body?.segments ?? []) as TranscriptSegment[];
      const result = services.meetingService.appendTranscript(req.params.id, segments);
      for (const segment of segments) {
        services.signalService.ingest({
          source: "meeting",
          sourceRef: `${req.params.id}:${segment.id}`,
          text: segment.text,
          evidenceKind: "transcript",
          evidenceUri: `meeting://${req.params.id}/segment/${segment.id}`,
          timestampMs: segment.timestampMs
        });
      }
      res.status(200).json(result);
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  });

  app.post("/v1/meetings/:id/stop", async (req, res) => {
    try {
      try {
        await transcription.stop({ id: req.params.id, kind: "meeting" });
      } catch (error) {
        logger?.warn("Stopping transcription failed before meeting stop", { error });
        throw error;
      }
      const session = services.meetingService.stop(req.params.id);
      res.status(200).json(session);
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  });

  app.get("/v1/meetings/:id/transcript", (req, res) => {
    try {
      const transcript = services.meetingService.getTranscript(req.params.id);
      res.status(200).json(transcript);
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  });

  app.post("/v1/meetings/:id/transcription/start", async (req, res) => {
    try {
      const transcript = services.meetingService.getTranscript(req.params.id);
      if (transcript.status === "completed") {
        res.status(409).json({ error: "Meeting session already completed." });
        return;
      }
      const started = await transcription.start(
        { id: req.params.id, kind: "meeting" },
        {
          realtimeModel: req.body?.realtimeModel,
          fallbackModel: req.body?.fallbackModel,
          language: req.body?.language,
          sampleRateHz: req.body?.sampleRateHz
        }
      );
      res.status(200).json(started);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/v1/meetings/:id/transcription/chunk", async (req, res) => {
    try {
      const result = await transcription.appendAudio(
        { id: req.params.id, kind: "meeting" },
        {
          audioBase64: req.body?.audioBase64,
          speaker: req.body?.speaker,
          sampleRateHz: req.body?.sampleRateHz
        }
      );
      res.status(202).json(result);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/v1/meetings/:id/transcription/stop", async (req, res) => {
    try {
      const result = await transcription.stop({ id: req.params.id, kind: "meeting" });
      const transcript = services.meetingService.getTranscript(req.params.id);
      for (const segment of transcript.transcriptSegments) {
        services.signalService.ingest({
          source: "meeting",
          sourceRef: `${req.params.id}:${segment.id}`,
          text: segment.text,
          evidenceKind: "transcript",
          evidenceUri: `meeting://${req.params.id}/segment/${segment.id}`,
          timestampMs: segment.timestampMs
        });
      }
      res.status(200).json({
        ...result,
        transcript
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });
};
