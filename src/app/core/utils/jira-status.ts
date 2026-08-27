import { JiraIssue } from '../models/jira-issue.model';

// Mapeamento de status -> classe de cor, por enquanto só para o tipo "Bug"
// (fluxo: Backlog -> Em andamento -> Em revisão -> Aguardando Homologação ->
// Em homologação -> Homologado -> Concluído).
const BUG_STATUS_CLASS: Record<string, string> = {
  Backlog: 'status-neutral',
  'Em revisão': 'status-neutral',
  'Aguardando Homologação': 'status-neutral',
  Homologado: 'status-neutral',
  'Em andamento': 'status-active',
  'Em homologação': 'status-active',
  Concluído: 'status-done',
};

export function jiraStatusClass(issue: Pick<JiraIssue, 'issueType' | 'status'>): string {
  if (issue.issueType !== 'Bug' || !issue.status) return '';
  return BUG_STATUS_CLASS[issue.status] ?? '';
}
