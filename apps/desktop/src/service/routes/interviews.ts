import type { TranscriptSegment } from "@scope/types";
import type { Express } from "express";
import type { CoreServices } from "@scope/core";
import type { OpenAIRealtimeTranscription } from "../../transcription";
import { syncMeetingToScopePm } from "../../meetings/webSync";
import type { AppLogger } from "../../telemetry/logger";

interface InterviewRouteDeps {
  services: CoreServices;
  transcription: OpenAIRealtimeTranscription;
  logger?: AppLogger;
}

export const registerInterviewRoutes = (app: Express, deps: InterviewRouteDeps) => {
  const { services, transcription, logger } = deps;

  app.post("/v1/interviews/start", (req, res) => {
    try {
      const consentAccepted = Boolean(req.body?.consentAccepted);
      const session = services.interviewService.start(consentAccepted);
      res.status(201).json(session);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/v1/interviews/:id/transcript", (req, res) => {
    try {
      const segments = (req.body?.segments ?? []) as TranscriptSegment[];
      const result = services.interviewService.appendTranscript(req.params.id, segments);
      for (const segment of segments) {
        services.signalService.ingest({
          source: "interview",
          sourceRef: `${req.params.id}:${segment.id}`,
          text: segment.text,
          evidenceKind: "transcript",
          evidenceUri: `interview://${req.params.id}/segment/${segment.id}`,
          timestampMs: segment.timestampMs
        });
      }
      res.status(200).json(result);
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  });

  app.post("/v1/interviews/:id/stop", async (req, res) => {
    try {
      try {
        await transcription.stop(req.params.id);
      } catch (error) {
        logger?.warn("Stopping transcription failed before interview stop", { error });
      }
      const session = services.interviewService.stop(req.params.id);
      void syncMeetingToScopePm({
          meeting: session,
          logger
        }).catch((error) => {
          logger?.warn("ScopePM meeting sync failed after interview stop", { error });
        });
      res.status(200).json(session);
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  });

  app.get("/v1/interviews/:id/transcript", (req, res) => {
    try {
      const transcript = services.interviewService.getTranscript(req.params.id);
      res.status(200).json(transcript);
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  });

  app.post("/v1/interviews/:id/transcription/start", async (req, res) => {
    try {
      services.interviewService.getTranscript(req.params.id);
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

  app.post("/v1/interviews/:id/transcription/chunk", async (req, res) => {
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

  app.post("/v1/interviews/:id/transcription/stop", async (req, res) => {
    try {
      const result = await transcription.stop(req.params.id);
      const transcript = services.interviewService.getTranscript(req.params.id);
      for (const segment of transcript.transcriptSegments) {
        services.signalService.ingest({
          source: "interview",
          sourceRef: `${req.params.id}:${segment.id}`,
          text: segment.text,
          evidenceKind: "transcript",
          evidenceUri: `interview://${req.params.id}/segment/${segment.id}`,
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
