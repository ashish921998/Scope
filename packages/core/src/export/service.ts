import type { ExportInput } from "@scope/types";
import { DossierRepo } from "../db/dossierRepo";
import { dossierToJson, dossierToMarkdown } from "./formatters";

export interface ExportResult {
  content: string;
  format: "markdown" | "json";
  pushed?: {
    provider: "linear" | "jira";
    ok: boolean;
    message: string;
  };
}

export class ExportService {
  constructor(private readonly dossierRepo: DossierRepo) {}

  exportDossier(input: ExportInput): ExportResult {
    const dossier = this.dossierRepo.get(input.dossierId);
    if (!dossier) {
      throw new Error(`Dossier ${input.dossierId} not found.`);
    }

    const content = input.format === "json" ? dossierToJson(dossier) : dossierToMarkdown(dossier);

    return {
      content,
      format: input.format
    };
  }
}
