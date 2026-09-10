export interface JiraIssue {
  key: string;
  url: string;
  summary: string;
  status: string | null;
  issueType: string | null;
  created: string | null;
  /** Campo customizado "Avaliação Dev" (Procedente / Não Procedente / …) ou null. */
  avaliacaoDev: string | null;
}

export interface JiraMyItemsResponse {
  issues: JiraIssue[];
}
