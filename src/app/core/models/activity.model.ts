export type WorkStatus =
  | 'a_fazer'
  | 'na_maquina'
  | 'finalizado_na_maquina'
  | 'no_repositorio'
  | 'para_deploy'
  | 'testando'
  | 'no_ar';

export interface WorkActivity {
  id: string;
  title: string;
  jira_url: string;
  status: WorkStatus;
  notes: string | null;
  parent_id: string | null;
  jira_key: string | null;
  jira_status: string | null;
  jira_issue_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkActivityCreate {
  title: string;
  jira_url: string;
  status?: WorkStatus;
  notes?: string | null;
  parent_id?: string | null;
  jira_key?: string | null;
  jira_status?: string | null;
  jira_issue_type?: string | null;
}

export interface WorkActivityUpdate {
  title?: string;
  jira_url?: string;
  status?: WorkStatus;
  notes?: string | null;
  parent_id?: string | null;
  jira_key?: string | null;
  jira_status?: string | null;
  jira_issue_type?: string | null;
}
