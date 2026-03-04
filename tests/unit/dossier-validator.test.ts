import { validateDossier } from "../../packages/core/src/dossier/validator";
import type { FeatureDossier, Signal } from "@scope/types";

const signal: Signal = {
  id: "sig-1",
  source: "slack",
  sourceRef: "1",
  type: "pain_point",
  confidence: 0.9,
  summary: "Onboarding is slow",
  createdAt: new Date().toISOString(),
  evidenceRefs: [
    {
      id: "ev-1",
      signalId: "sig-1",
      kind: "message",
      uri: "slack://1",
      quote: "Onboarding is slow"
    }
  ]
};

const dossier: FeatureDossier = {
  id: "dos-1",
  featureId: "feat-1",
  version: 1,
  createdAt: new Date().toISOString(),
  sections9: [
    "Problem",
    "Research Summary",
    "Solution",
    "Technical Spec",
    "UI/UX Spec",
    "Impact Analysis",
    "Risks",
    "Alternatives",
    "Acceptance Criteria"
  ].map((title) => ({ title: title as never, content: "ok" })),
  citations: [
    {
      signalId: "sig-1",
      evidenceId: "ev-1",
      quote: "Onboarding is slow"
    }
  ],
  criticNotes: []
};

describe("dossier validator", () => {
  it("passes with complete sections and valid citations", () => {
    expect(() => validateDossier(dossier, [signal])).not.toThrow();
  });
});
