const punctuation = /[^a-z0-9\s]/gi;

export const normalizeText = (text: string) =>
  text.toLowerCase().replace(punctuation, " ").replace(/\s+/g, " ").trim();

export const tokenize = (text: string) =>
  normalizeText(text)
    .split(" ")
    .filter((token) => token.length > 2);

export const jaccard = (a: string, b: string) => {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }

  return intersection / (setA.size + setB.size - intersection);
};
