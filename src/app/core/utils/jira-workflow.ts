import { JiraIssue } from '../models/jira-issue.model';

export interface JiraWorkflowStep {
  /** Nome canônico do status no Jira. */
  status: string;
  label: string;
  icon: string;
}

export interface JiraWorkflowProgress {
  steps: JiraWorkflowStep[];
  /** Índice do passo correspondente ao status atual da issue. */
  currentIndex: number;
}

// Fluxo mapeado do tipo "Bug" (árvore de status):
// Backlog -> Em análise -> Análise finalizada -> Em andamento -> Em revisão ->
// Aguardando Homologação -> Em homologação -> Homologado -> Concluído.
const BUG_WORKFLOW: JiraWorkflowStep[] = [
  { status: 'Backlog', label: 'Backlog', icon: 'inventory_2' },
  { status: 'Em análise', label: 'Em análise', icon: 'plagiarism' },
  { status: 'Análise finalizada', label: 'Análise finalizada', icon: 'fact_check' },
  { status: 'Em andamento', label: 'Em andamento', icon: 'code' },
  { status: 'Em revisão', label: 'Em revisão', icon: 'rate_review' },
  { status: 'Aguardando Homologação', label: 'Aguardando Homologação', icon: 'hourglass_top' },
  { status: 'Em homologação', label: 'Em homologação', icon: 'science' },
  { status: 'Homologado', label: 'Homologado', icon: 'verified' },
  { status: 'Concluído', label: 'Concluído', icon: 'check_circle' },
];

// issueType do Jira -> fluxo mapeado. Só "Bug" por enquanto.
const WORKFLOWS_BY_ISSUE_TYPE: Record<string, JiraWorkflowStep[]> = {
  Bug: BUG_WORKFLOW,
};

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

/**
 * Retorna o fluxo mapeado e o passo atual para a issue, ou `null` quando o tipo
 * não tem fluxo mapeado ou o status não pertence ao fluxo (nesses casos a UI
 * deve cair no comportamento antigo de exibir o status como texto).
 */
export function jiraWorkflowProgress(
  issue: Pick<JiraIssue, 'issueType' | 'status'>,
): JiraWorkflowProgress | null {
  if (!issue.issueType || !issue.status) return null;

  const steps = WORKFLOWS_BY_ISSUE_TYPE[issue.issueType];
  if (!steps) return null;

  const target = normalize(issue.status);
  const currentIndex = steps.findIndex((step) => normalize(step.status) === target);
  if (currentIndex === -1) return null;

  return { steps, currentIndex };
}
