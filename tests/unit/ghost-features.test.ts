import { detectGhostFeatures } from "../../packages/core/src/features/ghostFeatures";
import type { Signal } from "@scope/types";

const makeSignal = (id: string, summary: string): Signal => ({
  id,
  source: "slack",
  sourceRef: id,
  type: "pain_point",
  confidence: 0.8,
  summary,
  createdAt: new Date().toISOString(),
  evidenceRefs: [
    {
      id: `${id}-evidence`,
      signalId: id,
      kind: "message",
      uri: `slack://${id}`,
      quote: summary
    }
  ]
});

describe("ghost feature detection", () => {
  it("returns candidates only when 3+ related signals cluster", () => {
    const signals = [
      makeSignal("1", "Onboarding setup is manual and slow for enterprise users"),
      makeSignal("2", "Manual onboarding workflow slows account activation"),
      makeSignal("3", "Need automation for onboarding setup steps"),
      makeSignal("4", "Dashboard theme color request")
    ];

    const candidates = detectGhostFeatures(signals);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].signalIds.length).toBeGreaterThanOrEqual(3);
  });
});
