const ISSUE_KEY = /([A-Z][A-Z0-9]*-\d+)/i;

/** Extrai a chave da issue (ex. "SGE-17040") de um link do Jira/Gira. */
export function extractJiraKey(url: string): string | null {
  const browsePath = url.match(new RegExp(`/browse/${ISSUE_KEY.source}`, 'i'));
  if (browsePath) {
    return browsePath[1].toUpperCase();
  }
  const anywhere = url.match(ISSUE_KEY);
  return anywhere ? anywhere[1].toUpperCase() : null;
}
