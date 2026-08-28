import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { WorkActivity } from '../../../core/models/activity.model';
import { jiraStatusClass } from '../../../core/utils/jira-status';
import { JiraWorkflowProgress, jiraWorkflowProgress } from '../../../core/utils/jira-workflow';

export interface JiraActivityTreeHost {
  childrenOf(parentId: string): WorkActivity[];
  hasChildren(activity: WorkActivity): boolean;
  canHaveChildren(activity: WorkActivity): boolean;
  isParentExpanded(parentId: string): boolean;
  toggleParent(parentId: string): void;
}

@Component({
  selector: 'app-jira-activity-node',
  imports: [MatIconModule, JiraActivityNode],
  templateUrl: './jira-activity-node.html',
  styleUrl: './jira-activity-node.scss',
})
export class JiraActivityNode {
  @Input({ required: true }) activity!: WorkActivity;
  @Input({ required: true }) page!: JiraActivityTreeHost;
  @Input() depth = 1;

  statusClass(): string {
    return jiraStatusClass({
      issueType: this.activity.jira_issue_type,
      status: this.activity.jira_status,
    });
  }

  /**
   * Fluxo mapeado (hoje só "Bug") com o passo atual. `null` quando o tipo/status
   * não está mapeado — nesse caso o template mostra o status como texto.
   */
  workflow(): JiraWorkflowProgress | null {
    return jiraWorkflowProgress({
      issueType: this.activity.jira_issue_type,
      status: this.activity.jira_status,
    });
  }
}
