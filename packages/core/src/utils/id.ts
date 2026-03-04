import { createHash, randomUUID } from "node:crypto";

export const newId = () => randomUUID();

export const stableFingerprint = (input: string) =>
  createHash("sha256").update(input.trim().toLowerCase()).digest("hex");
