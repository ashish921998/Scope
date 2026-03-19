import type { GhostScanResult, Signal, SignalIngestInput } from "@scope/types";
import { embedText } from "../ai/embeddings";
import { EmbeddingRepo } from "../db/embeddingRepo";
import { FeatureRepo } from "../db/featureRepo";
import { SignalRepo } from "../db/signalRepo";
import { detectGhostFeatures } from "../features/ghostFeatures";
import { newId, stableFingerprint } from "../utils/id";
import { nowIso } from "../utils/time";
import { classifySignal } from "./classifier";
import { isDuplicateBySimilarity } from "./dedupe";
import { normalizeSignalInput } from "./normalizer";

export class SignalService {
  constructor(
    private readonly signalRepo: SignalRepo,
    private readonly featureRepo: FeatureRepo,
    private readonly embeddingRepo: EmbeddingRepo
  ) {}

  ingest(input: SignalIngestInput) {
    const normalized = normalizeSignalInput(input);

    const existingBySource = this.signalRepo.findBySourceRef(normalized.source, normalized.sourceRef);
    if (existingBySource) {
      const existing = this.signalRepo.listByIds([existingBySource])[0];
      return {
        signal: existing,
        deduped: true,
        duplicateReason: "source_ref"
      };
    }

    const fingerprint = stableFingerprint(`${normalized.source}:${normalized.text}`);
    const existingByFingerprint = this.signalRepo.findByFingerprint(fingerprint);
    if (existingByFingerprint) {
      return {
        signal: existingByFingerprint,
        deduped: true,
        duplicateReason: "fingerprint"
      };
    }

    const recent = this.signalRepo.list(300);
    const dedupeSimilarity = isDuplicateBySimilarity(normalized.text, recent);
    if (dedupeSimilarity.duplicate) {
      const existing = recent.find((signal) => signal.id === dedupeSimilarity.existingId);
      if (existing) {
        return {
          signal: existing,
          deduped: true,
          duplicateReason: "similarity"
        };
      }
    }

    const classification = classifySignal(normalized.text);

    const signal: Signal = {
      id: newId(),
      source: normalized.source,
      sourceRef: normalized.sourceRef,
      type: classification.type,
      confidence: classification.confidence,
      summary: normalized.text,
      createdAt: nowIso(),
      metadata: normalized.metadata,
      evidenceRefs: [
        {
          id: newId(),
          signalId: "",
          kind: normalized.evidenceKind ?? inferEvidenceKind(normalized.source),
          uri: normalized.evidenceUri ?? `${normalized.source}://${normalized.sourceRef}`,
          quote: normalized.text,
          timestampMs: normalized.timestampMs
        }
      ]
    };

    signal.evidenceRefs = signal.evidenceRefs.map((ref) => ({ ...ref, signalId: signal.id }));

    this.signalRepo.save(signal, fingerprint);
    this.embeddingRepo.save({
      id: newId(),
      signalId: signal.id,
      vector: embedText(signal.summary),
      model: "deterministic-hash-v1"
    });

    return {
      signal,
      deduped: false
    };
  }

  stream(limit = 200) {
    return this.signalRepo.list(limit);
  }

  scanGhostFeatures(): GhostScanResult {
    const signals = this.signalRepo.list(500);
    const candidates = detectGhostFeatures(signals);

    for (const candidate of candidates) {
      this.featureRepo.save(candidate);
    }

    return {
      candidates,
      scannedSignals: signals.length
    };
  }
}

const inferEvidenceKind = (source: SignalIngestInput["source"]) => {
  switch (source) {
    case "interview":
    case "meeting":
      return "transcript" as const;
    case "posthog":
      return "event" as const;
    case "linear":
    case "github":
    case "google":
    case "jira":
      return "issue" as const;
    case "notion":
    case "research_upload":
      return "document" as const;
    case "slack":
    default:
      return "message" as const;
  }
};
