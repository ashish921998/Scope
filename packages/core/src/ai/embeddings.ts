import { createHash } from "node:crypto";
import { tokenize } from "../utils/text";

const DIMENSIONS = 64;

const hashToIndex = (token: string) => {
  const hash = createHash("sha1").update(token).digest("hex");
  return Number.parseInt(hash.slice(0, 8), 16) % DIMENSIONS;
};

export const embedText = (text: string): number[] => {
  const vector = Array.from({ length: DIMENSIONS }, () => 0);
  const tokens = tokenize(text);

  for (const token of tokens) {
    vector[hashToIndex(token)] += 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return vector;
  }

  return vector.map((value) => value / norm);
};

export const cosineSimilarity = (a: number[], b: number[]) => {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    sum += a[i] * b[i];
  }

  return sum;
};
