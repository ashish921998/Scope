import { safeFetch } from "../security/egress";

export const pushDossierToLinear = async (params: {
  apiKey: string;
  issueId: string;
  markdown: string;
}) => {
  const body = {
    query: `mutation CommentCreate($input: CommentCreateInput!) { commentCreate(input: $input) { success } }`,
    variables: {
      input: {
        issueId: params.issueId,
        body: params.markdown
      }
    }
  };

  const response = await safeFetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Linear export failed: ${text}`);
  }

  return { ok: true };
};
