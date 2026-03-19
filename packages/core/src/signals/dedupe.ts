import type { Signal } from "@scope/types";
import { jaccard } from "../utils/text";

export const isDuplicateBySimilarity = (candidateSummary: string, existingSignals: Signal[]) => {
  for (const signal of existingSignals) {
    const score = jaccard(candidateSummary, signal.summary);
    if (score >= 0.75) {
      return { duplicate: true, existingId: signal.id, score };
    }
  }

  return { duplicate: false, score: 0 };
};
