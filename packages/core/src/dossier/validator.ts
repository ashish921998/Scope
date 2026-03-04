import type { DossierSection, FeatureDossier, Signal } from "@scope/types";

const requiredSections: DossierSection["title"][] = [
  "Problem",
  "Research Summary",
  "Solution",
  "Technical Spec",
  "UI/UX Spec",
  "Impact Analysis",
  "Risks",
  "Alternatives",
  "Acceptance Criteria"
];

export const validateDossier = (dossier: FeatureDossier, sourceSignals: Signal[]) => {
  const sectionTitles = new Set(dossier.sections9.map((section) => section.title));
  const missing = requiredSections.filter((title) => !sectionTitles.has(title));
  if (missing.length > 0) {
    throw new Error(`Missing dossier sections: ${missing.join(", ")}`);
  }

  if (dossier.citations.length === 0) {
    throw new Error("Dossier requires at least one citation.");
  }

  const signalIds = new Set(sourceSignals.map((signal) => signal.id));
  for (const citation of dossier.citations) {
    if (!signalIds.has(citation.signalId)) {
      throw new Error(`Citation references unknown signal: ${citation.signalId}`);
    }
    if (!citation.quote.trim()) {
      throw new Error(`Citation for signal ${citation.signalId} has empty quote.`);
    }
  }
};
