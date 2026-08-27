export interface JiraIssue {
  key: string;
  url: string;
  summary: string;
  status: string | null;
  issueType: string | null;
  created: string | null;
}

export interface JiraMyItemsResponse {
  issues: JiraIssue[];
}
