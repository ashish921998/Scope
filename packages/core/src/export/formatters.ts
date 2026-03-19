import type { FeatureDossier } from "@scope/types";
import { redactSensitiveText } from "../security/redaction";

export const dossierToMarkdown = (dossier: FeatureDossier) => {
  const sectionMarkdown = dossier.sections
    .map((section) => `## ${section.title}\n\n${redactSensitiveText(section.content)}`)
    .join("\n\n");

  const citations = dossier.citations
    .map(
      (citation, index) =>
        `${index + 1}. Signal ${citation.signalId} / Evidence ${citation.evidenceId}: ${redactSensitiveText(citation.quote)}`
    )
    .join("\n");

  return `# Feature Dossier ${dossier.id}\n\nFeature ID: ${dossier.featureId}\nVersion: ${dossier.version}\n\n${sectionMarkdown}\n\n## Citations\n\n${citations}\n\n## Critic Notes\n\n${dossier.criticNotes.map((note) => `- ${redactSensitiveText(note)}`).join("\n")}`;
};

export const dossierToJson = (dossier: FeatureDossier) =>
  JSON.stringify(
    {
      ...dossier,
      sections: dossier.sections.map((section) => ({
        ...section,
        content: redactSensitiveText(section.content)
      })),
      citations: dossier.citations.map((citation) => ({
        ...citation,
        quote: redactSensitiveText(citation.quote)
      })),
      criticNotes: dossier.criticNotes.map(redactSensitiveText)
    },
    null,
    2
  );
