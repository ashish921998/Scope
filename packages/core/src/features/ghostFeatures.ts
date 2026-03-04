import type { FeatureCandidate, Signal } from "@scope/types";
import { cosineSimilarity, embedText } from "../ai/embeddings";
import { tokenize } from "../utils/text";
import { newId } from "../utils/id";
import { nowIso } from "../utils/time";

const CLUSTER_SIMILARITY_THRESHOLD = 0.2;
const CANDIDATE_MIN_SIGNALS = 3;
const CANDIDATE_MIN_SCORE = 0.35;

interface Cluster {
  anchorId: string;
  signalIds: string[];
  scoreSum: number;
}

const makeTitle = (signals: Signal[]) => {
  const words = signals
    .flatMap((signal) => signal.summary.toLowerCase().split(/\W+/g))
    .filter((word) => word.length > 4);
  const top = Array.from(new Set(words)).slice(0, 3);
  if (top.length === 0) {
    return "Clustered feedback opportunity";
  }
  return `Improve ${top.join(" ")}`;
};

export const detectGhostFeatures = (signals: Signal[]): FeatureCandidate[] => {
  if (signals.length < CANDIDATE_MIN_SIGNALS) {
    return [];
  }

  const vectors = new Map<string, number[]>();
  const tokenSets = new Map<string, Set<string>>();
  for (const signal of signals) {
    vectors.set(signal.id, embedText(signal.summary));
    tokenSets.set(signal.id, new Set(tokenize(signal.summary)));
  }

  const clusters: Cluster[] = [];

  for (let i = 0; i < signals.length; i += 1) {
    const anchor = signals[i];
    const cluster: Cluster = {
      anchorId: anchor.id,
      signalIds: [anchor.id],
      scoreSum: 1
    };

    for (let j = 0; j < signals.length; j += 1) {
      if (i === j) {
        continue;
      }
      const other = signals[j];
      const sim = similarityScore(
        vectors.get(anchor.id) ?? [],
        vectors.get(other.id) ?? [],
        tokenSets.get(anchor.id) ?? new Set<string>(),
        tokenSets.get(other.id) ?? new Set<string>()
      );
      if (sim >= CLUSTER_SIMILARITY_THRESHOLD) {
        cluster.signalIds.push(other.id);
        cluster.scoreSum += sim;
      }
    }

    clusters.push(cluster);
  }

  const dedupe = new Map<string, Cluster>();
  for (const cluster of clusters) {
    const key = [...cluster.signalIds].sort().join("|");
    if (!dedupe.has(key)) {
      dedupe.set(key, cluster);
    }
  }

  const candidates: FeatureCandidate[] = [];
  for (const cluster of dedupe.values()) {
    const size = cluster.signalIds.length;
    const score = cluster.scoreSum / size;

    if (size >= CANDIDATE_MIN_SIGNALS && score >= CANDIDATE_MIN_SCORE) {
      const clusterSignals = signals.filter((signal) => cluster.signalIds.includes(signal.id));
      candidates.push({
        id: newId(),
        title: makeTitle(clusterSignals),
        signalIds: [...new Set(cluster.signalIds)],
        clusterScore: Number(score.toFixed(3)),
        status: "suggested",
        createdAt: nowIso()
      });
    }
  }

  return candidates;
};

const similarityScore = (
  vectorA: number[],
  vectorB: number[],
  tokenSetA: Set<string>,
  tokenSetB: Set<string>
) => {
  const cosine = cosineSimilarity(vectorA, vectorB);

  if (tokenSetA.size === 0 || tokenSetB.size === 0) {
    return cosine;
  }

  let intersection = 0;
  for (const token of tokenSetA) {
    if (tokenSetB.has(token)) {
      intersection += 1;
    }
  }

  const overlap = intersection / Math.min(tokenSetA.size, tokenSetB.size);
  return Math.max(cosine, overlap);
};
