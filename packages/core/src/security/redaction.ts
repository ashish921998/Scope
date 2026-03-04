const patterns = [
  /(sk-[a-zA-Z0-9]{20,})/g,
  /(api[_-]?key\s*[:=]\s*[a-zA-Z0-9-_]{10,})/gi,
  /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,})/gi,
  /(\+?\d[\d\s\-()]{8,}\d)/g
];

export const redactSensitiveText = (text: string) => {
  let output = text;
  for (const pattern of patterns) {
    output = output.replace(pattern, "[REDACTED]");
  }
  return output;
};
