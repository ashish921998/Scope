import type { DossierSection, FeatureDossier, Signal } from "@scope/types";
import { safeFetch } from "../security/egress";
import { newId } from "../utils/id";
import { nowIso } from "../utils/time";
import { validateDossier } from "./validator";

const callAnthropic = async (key: string, systemPrompt: string, userMessage: string): Promise<string> => {
  const response = await safeFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }]
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${text}`);
  }
  const data = await response.json() as { content: Array<{ type: string; text: string }> };
  const text = data.content.find(c => c.type === "text")?.text ?? "";
  return text;
};

const parseJsonResponse = <T>(text: string, fallback: T): T => {
  try {
    const match = text.match(/```json\s*([\s\S]*?)\s*```/) ?? text.match(/(\{[\s\S]*\})/);
    const raw = match ? match[1] : text;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

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

const runResearcher = async (signals: Signal[], anthropicKey: string | null = null): Promise<ResearchOutput> => {
  const summaries = signals.map((signal) => signal.summary);
  const painThemes = uniqueTake(
    signals.filter((signal) => signal.type === "pain_point").map((signal) => signal.summary),
    4
  );
  const outcomes = uniqueTake(
    signals.filter((signal) => signal.type === "feature_request").map((signal) => signal.summary),
    4
  );

  const deterministicResult: ResearchOutput = {
    summary: summaries.slice(0, 6).join("; "),
    painThemes,
    outcomes
  };

  if (!anthropicKey) {
    return deterministicResult;
  }

  try {
    const userMessage = `Analyze these product signals and return a research summary as JSON.

Signals:
${signals.map((s, i) => `${i + 1}. [${s.type}] ${s.summary}`).join("\n")}

Return exactly this JSON structure:
{"summary": "concise synthesis of the signals", "painThemes": ["theme1", "theme2"], "outcomes": ["desired outcome1", "desired outcome2"]}`;

    const text = await callAnthropic(
      anthropicKey,
      "You are a product research analyst. Respond with valid JSON only.",
      userMessage
    );
    return parseJsonResponse<ResearchOutput>(text, deterministicResult);
  } catch {
    return deterministicResult;
  }
};

const runAnalyst = async (research: ResearchOutput, signals: Signal[], anthropicKey: string | null = null): Promise<AnalysisOutput> => {
  const ranked = [...signals].sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  const primaryProblem =
    research.painThemes[0] ?? ranked[0]?.summary ?? "Users face recurring friction in the product workflow.";

  const deterministicRisks = [
    "Incomplete evidence coverage in early interviews",
    "Potential implementation complexity across integrations",
    "Risk of overfitting to vocal customer segments"
  ];

  const deterministicAlternatives = [
    "Manual triage of signals before automated clustering",
    "Ship read-only signal summaries before full dossier generation",
    "Prioritize one integration source for first release"
  ];

  const deterministicResult: AnalysisOutput = {
    primaryProblem,
    topSignals: ranked,
    risks: deterministicRisks,
    alternatives: deterministicAlternatives
  };

  if (!anthropicKey) {
    return deterministicResult;
  }

  try {
    const userMessage = `Given this research summary and product signals, perform an analysis and return JSON.

Research Summary: ${research.summary}
Pain Themes: ${research.painThemes.join(", ")}
Desired Outcomes: ${research.outcomes.join(", ")}

Top signals by confidence:
${ranked.map((s, i) => `${i + 1}. [confidence: ${s.confidence}] ${s.summary}`).join("\n")}

Return exactly this JSON structure:
{"primaryProblem": "the core problem statement", "risks": ["risk1", "risk2", "risk3"], "alternatives": ["alt1", "alt2", "alt3"]}`;

    const text = await callAnthropic(
      anthropicKey,
      "You are a product analyst. Respond with valid JSON only.",
      userMessage
    );
    const parsed = parseJsonResponse<{ primaryProblem?: string; risks?: string[]; alternatives?: string[] }>(text, {});
    return {
      primaryProblem: parsed.primaryProblem ?? deterministicResult.primaryProblem,
      topSignals: ranked,
      risks: parsed.risks ?? deterministicResult.risks,
      alternatives: parsed.alternatives ?? deterministicResult.alternatives
    };
  } catch {
    return deterministicResult;
  }
};

const runWriter = async (research: ResearchOutput, analysis: AnalysisOutput, signals: Signal[], anthropicKey: string | null = null): Promise<WritingOutput> => {
  const deterministicSections: DossierSection[] = [
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

  const deterministicNotes = [
    "Ensure every major claim has at least one evidence citation.",
    "Review confidence thresholds quarterly against real customer outcomes.",
    "Track false-positive ghost feature clusters in telemetry."
  ];

  const deterministicResult: WritingOutput = {
    sections: deterministicSections,
    criticNotes: deterministicNotes
  };

  if (!anthropicKey) {
    return deterministicResult;
  }

  const requiredTitles = [
    "Problem",
    "Research Summary",
    "Solution",
    "Technical Spec",
    "UI/UX Spec",
    "Impact Analysis",
    "Risks",
    "Alternatives",
    "Acceptance Criteria"
  ] as const;

  try {
    const userMessage = `Write a complete feature specification dossier based on these signals and analysis.

Problem: ${analysis.primaryProblem}
Research Summary: ${research.summary}
Pain Themes: ${research.painThemes.join(", ")}
Desired Outcomes: ${research.outcomes.join(", ")}
Risks: ${analysis.risks.join(", ")}
Alternatives: ${analysis.alternatives.join(", ")}

Source signals (${signals.length} total):
${signals.slice(0, 8).map((s, i) => `${i + 1}. [${s.type}, confidence: ${s.confidence}] ${s.summary}`).join("\n")}

Write all 9 required sections with content that is specific to the actual signals and problem above (not generic boilerplate).
Required sections: Problem, Research Summary, Solution, Technical Spec, UI/UX Spec, Impact Analysis, Risks, Alternatives, Acceptance Criteria.

Return exactly this JSON structure:
{"sections": [{"title": "Problem", "content": "..."}, {"title": "Research Summary", "content": "..."}, ...all 9 sections], "criticNotes": ["note1", "note2"]}`;

    const text = await callAnthropic(
      anthropicKey,
      "You are a senior product manager writing a feature specification. Respond with valid JSON only.",
      userMessage
    );
    const parsed = parseJsonResponse<{ sections?: Array<{ title: string; content: string }>; criticNotes?: string[] }>(text, {});

    if (parsed.sections) {
      const sectionTitles = new Set(parsed.sections.map(s => s.title));
      const allPresent = requiredTitles.every(t => sectionTitles.has(t));
      if (allPresent) {
        return {
          sections: parsed.sections as DossierSection[],
          criticNotes: parsed.criticNotes ?? deterministicNotes
        };
      }
    }

    return deterministicResult;
  } catch {
    return deterministicResult;
  }
};

const runCritic = async (output: WritingOutput, signals: Signal[], anthropicKey: string | null = null): Promise<WritingOutput> => {
  const signalCount = signals.length;
  if (signalCount < 3) {
    output.criticNotes.push("Low evidence volume: at least 3 signals recommended for robust feature decisions.");
  }

  if (!anthropicKey) {
    return output;
  }

  try {
    const userMessage = `Review this feature specification and provide specific, actionable critique notes.

Sections:
${output.sections.map(s => `**${s.title}**\n${s.content}`).join("\n\n")}

Signal count: ${signalCount}
Existing critic notes: ${output.criticNotes.join("; ")}

Return exactly this JSON structure with 2-4 specific, actionable critique notes about gaps, risks, or improvements:
{"criticNotes": ["note1", "note2", "note3"]}`;

    const text = await callAnthropic(
      anthropicKey,
      "You are a product critique reviewing a feature spec. Respond with valid JSON only.",
      userMessage
    );
    const parsed = parseJsonResponse<{ criticNotes?: string[] }>(text, {});
    if (parsed.criticNotes?.length) {
      output.criticNotes.push(...parsed.criticNotes);
    }
  } catch {
    // fall through with existing notes
  }

  return output;
};

export const generateFeatureDossier = async (
  featureId: string,
  signals: Signal[],
  anthropicKey: string | null = null
): Promise<FeatureDossier> => {
  if (signals.length === 0) {
    throw new Error("Cannot generate dossier without signals.");
  }

  const research = await runResearcher(signals, anthropicKey);
  const analysis = await runAnalyst(research, signals, anthropicKey);
  const writing = await runWriter(research, analysis, signals, anthropicKey);
  const critic = await runCritic(writing, signals, anthropicKey);

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
    sections: critic.sections,
    citations,
    criticNotes: critic.criticNotes,
    version: 1,
    createdAt: nowIso()
  };

  validateDossier(dossier, signals);

  return dossier;
};
