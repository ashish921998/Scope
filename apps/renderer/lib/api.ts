const DEFAULT_API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4010";

let cachedToken: string | null = null;
let cachedBaseUrl: string | null = null;

const getToken = async (): Promise<string | null> => {
  if (cachedToken) return cachedToken;
  if (typeof window !== "undefined" && (window as unknown as { scope?: { getServiceToken?: () => Promise<string> } }).scope?.getServiceToken) {
    cachedToken = await (window as unknown as { scope: { getServiceToken: () => Promise<string> } }).scope.getServiceToken();
  }
  return cachedToken;
};

export const fetchJson = async (path: string, init?: RequestInit) => {
  if (!cachedBaseUrl && typeof window !== "undefined" && window.scope?.getServiceBaseUrl) {
    cachedBaseUrl = await window.scope.getServiceBaseUrl();
  }
  const token = await getToken();
  const response = await fetch(`${cachedBaseUrl ?? DEFAULT_API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error ?? JSON.stringify(data));
  }
  return data;
};
