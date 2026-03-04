import type { SignalType } from "@scope/types";
import { normalizeText } from "../utils/text";

const rules: Array<{ type: SignalType; weight: number; keywords: string[] }> = [
  {
    type: "bug",
    weight: 0.92,
    keywords: ["crash", "error", "broken", "fails", "bug", "regression", "exception"]
  },
  {
    type: "feature_request",
    weight: 0.88,
    keywords: ["wish", "would love", "request", "feature", "can you add", "need ability"]
  },
  {
    type: "pain_point",
    weight: 0.84,
    keywords: ["frustrating", "hard to", "pain", "slow", "manual", "confusing"]
  },
  {
    type: "positive_feedback",
    weight: 0.78,
    keywords: ["love", "great", "awesome", "helpful", "works well", "smooth"]
  },
  {
    type: "analytics_insight",
    weight: 0.82,
    keywords: ["conversion", "drop off", "retention", "funnel", "activation", "experiment"]
  }
];

export interface Classification {
  type: SignalType;
  confidence: number;
}

export const classifySignal = (rawText: string): Classification => {
  const text = normalizeText(rawText);

  let best: Classification = { type: "pain_point", confidence: 0.55 };

  for (const rule of rules) {
    const matches = rule.keywords.filter((keyword) => text.includes(normalizeText(keyword))).length;
    if (matches === 0) {
      continue;
    }

    const confidence = Math.min(0.99, rule.weight + matches * 0.03);
    if (confidence > best.confidence) {
      best = {
        type: rule.type,
        confidence
      };
    }
  }

  return best;
};
