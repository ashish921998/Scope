import type { MeetingNotes, TranscriptSegment } from "@scope/types";
import { safeFetch } from "../security/egress";

const ANTHROPIC_TIMEOUT_MS = 10_000;

const callAnthropic = async (key: string, systemPrompt: string, userMessage: string): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);
  const response = await safeFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }]
    }),
    signal: controller.signal
  }).finally(() => {
    clearTimeout(timeout);
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${text}`);
  }
  const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
  return data.content.find((item) => item.type === "text")?.text ?? "";
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

const uniqueTake = (items: string[], max = 4) =>
  Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).slice(0, max);

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const fallbackSentenceSplit = (text: string) =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

export const generateMeetingNotesFallback = (segments: TranscriptSegment[]): MeetingNotes => {
  const orderedSegments = [...segments].sort((a, b) => a.timestampMs - b.timestampMs);
  const textLines = orderedSegments.map((segment) => segment.text.trim()).filter(Boolean);
  const sentences = fallbackSentenceSplit(textLines.join(" "));

  const summary =
    sentences.slice(0, 3).join(" ") ||
    textLines.slice(0, 3).join(" ") ||
    "No transcript content available.";

  const decisions = uniqueTake(
    textLines.filter((line) => /\b(decide|decision|agreed|will|ship|plan)\b/i.test(line)),
    4
  );
  const actionItems = uniqueTake(
    textLines.filter((line) => /\b(action|todo|follow up|next step|owner|need to)\b/i.test(line)),
    4
  );
  const followUps = uniqueTake(
    textLines.filter((line) => /\?/.test(line) || /\b(question|clarify|confirm)\b/i.test(line)),
    4
  );

  return {
    summary,
    decisions: decisions.length > 0 ? decisions : uniqueTake(textLines.slice(0, 2), 2),
    actionItems: actionItems.length > 0 ? actionItems : uniqueTake(textLines.slice(2, 4), 2),
    followUps: followUps.length > 0 ? followUps : uniqueTake(textLines.slice(4, 6), 2)
  };
};

export const generateMeetingNotes = async (
  segments: TranscriptSegment[],
  anthropicKey: string | null = null
): Promise<MeetingNotes> => {
  const deterministicResult = generateMeetingNotesFallback(segments);

  if (!anthropicKey) {
    return deterministicResult;
  }

  try {
    const userMessage = `Generate structured meeting notes from this transcript and return valid JSON only.

Transcript:
${segments.map((segment, index) => `${index + 1}. [${segment.speaker}] ${segment.text}`).join("\n")}

Return exactly this JSON structure:
{"summary":"short meeting summary","decisions":["decision 1"],"actionItems":["action 1"],"followUps":["follow-up 1"]}`;

    const text = await callAnthropic(
      anthropicKey,
      "You are a meeting notes assistant. Respond with valid JSON only.",
      userMessage
    );
    const parsed = parseJsonResponse<Partial<MeetingNotes>>(text, {});
    return {
      summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : deterministicResult.summary,
      decisions: asStringArray(parsed.decisions).length > 0 ? uniqueTake(asStringArray(parsed.decisions)) : deterministicResult.decisions,
      actionItems:
        asStringArray(parsed.actionItems).length > 0
          ? uniqueTake(asStringArray(parsed.actionItems))
          : deterministicResult.actionItems,
      followUps:
        asStringArray(parsed.followUps).length > 0
          ? uniqueTake(asStringArray(parsed.followUps))
          : deterministicResult.followUps
    };
  } catch {
    return deterministicResult;
  }
};
