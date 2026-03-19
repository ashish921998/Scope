import { safeFetch } from "../security/egress";

export const pushDossierToJira = async (params: {
  baseUrl: string;
  authHeader: string;
  issueKey: string;
  markdown: string;
}) => {
  const response = await safeFetch(`${params.baseUrl}/rest/api/2/issue/${params.issueKey}/comment`, {
    method: "POST",
    headers: {
      Authorization: params.authHeader,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      body: params.markdown
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Jira export failed: ${text}`);
  }

  return { ok: true };
};
