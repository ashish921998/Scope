import type { DossierSection, FeatureDossier, Signal } from "@scope/types";
import { newId } from "../utils/id";
import { nowIso } from "../utils/time";
import { validateDossier } from "./validator";

interface ResearchOutput {
  summary: string;
  painThemes: string[];
  outcomes: string[];
}

interface AnalysisOutput {
  primaryProblem: string;
  topSignals: Signal[];
  risks: string[];
  alternatives: string[];
}

interface WritingOutput {
  sections: DossierSection[];
  criticNotes: string[];
}

const uniqueTake = (items: string[], max = 5) => Array.from(new Set(items)).slice(0, max);

const runResearcher = (signals: Signal[]): ResearchOutput => {
  const summaries = signals.map((signal) => signal.summary);
  const painThemes = uniqueTake(
    signals.filter((signal) => signal.type === "pain_point").map((signal) => signal.summary),
    4
  );
  const outcomes = uniqueTake(
    signals.filter((signal) => signal.type === "feature_request").map((signal) => signal.summary),
    4
  );

  return {
    summary: summaries.slice(0, 6).join("; "),
    painThemes,
    outcomes
  };
};

const runAnalyst = (research: ResearchOutput, signals: Signal[]): AnalysisOutput => {
  const ranked = [...signals].sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  const primaryProblem =
    research.painThemes[0] ?? ranked[0]?.summary ?? "Users face recurring friction in the product workflow.";

  const risks = [
    "Incomplete evidence coverage in early interviews",
    "Potential implementation complexity across integrations",
    "Risk of overfitting to vocal customer segments"
  ];

  const alternatives = [
    "Manual triage of signals before automated clustering",
    "Ship read-only signal summaries before full dossier generation",
    "Prioritize one integration source for first release"
  ];

  return {
    primaryProblem,
    topSignals: ranked,
    risks,
    alternatives
  };
};

const runWriter = (research: ResearchOutput, analysis: AnalysisOutput): WritingOutput => {
  const sections: DossierSection[] = [
    {
      title: "Problem",
      content: `Primary problem: ${analysis.primaryProblem}`
    },
    {
      title: "Research Summary",
      content: `Evidence summary: ${research.summary || "No summary available."}`
    },
    {
      title: "Solution",
      content: `Proposed solution: unify intake, classification, and dossier generation around high-confidence user signals.`
    },
    {
      title: "Technical Spec",
      content: `Implement ingestion queue, deterministic classifier, dedupe, ghost feature clustering, and sequential dossier pipeline.`
    },
    {
      title: "UI/UX Spec",
      content: `Signal stream with confidence badges, interview transcript panel, and dossier editor with linked citations.`
    },
    {
      title: "Impact Analysis",
      content: `Expected impact: reduced time-to-spec and improved evidence quality for build prioritization.`
    },
    {
      title: "Risks",
      content: analysis.risks.join("; ")
    },
    {
      title: "Alternatives",
      content: analysis.alternatives.join("; ")
    },
    {
      title: "Acceptance Criteria",
      content:
        "User can ingest signals from three sources, generate a 9-section dossier with citations, and export in markdown/json formats."
    }
  ];

  const criticNotes = [
    "Ensure every major claim has at least one evidence citation.",
    "Review confidence thresholds quarterly against real customer outcomes.",
    "Track false-positive ghost feature clusters in telemetry."
  ];

  return {
    sections,
    criticNotes
  };
};

const runCritic = (output: WritingOutput, signals: Signal[]) => {
  const signalCount = signals.length;
  if (signalCount < 3) {
    output.criticNotes.push("Low evidence volume: at least 3 signals recommended for robust feature decisions.");
  }

  return output;
};

export const generateFeatureDossier = (featureId: string, signals: Signal[]): FeatureDossier => {
  if (signals.length === 0) {
    throw new Error("Cannot generate dossier without signals.");
  }

  const research = runResearcher(signals);
  const analysis = runAnalyst(research, signals);
  const writing = runWriter(research, analysis);
  const critic = runCritic(writing, signals);

  const citations = analysis.topSignals.flatMap((signal) =>
    signal.evidenceRefs.slice(0, 2).map((evidence) => ({
      signalId: signal.id,
      evidenceId: evidence.id,
      quote: evidence.quote
    }))
  );

  const dossier: FeatureDossier = {
    id: newId(),
    featureId,
    sections9: critic.sections,
    citations,
    criticNotes: critic.criticNotes,
    version: 1,
    createdAt: nowIso()
  };

  validateDossier(dossier, signals);

  return dossier;
};
