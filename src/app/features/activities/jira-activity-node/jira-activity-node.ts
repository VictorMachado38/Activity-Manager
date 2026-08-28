import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { WorkActivity, WorkStatus } from '../../../core/models/activity.model';
import { jiraStatusClass } from '../../../core/utils/jira-status';
import { JiraWorkflowProgress, jiraWorkflowProgress } from '../../../core/utils/jira-workflow';
import { StatusStep } from '../activity-node/activity-node';

export interface JiraActivityTreeHost {
  readonly steps: StatusStep[];
  childrenOf(parentId: string): WorkActivity[];
  hasChildren(activity: WorkActivity): boolean;
  canHaveChildren(activity: WorkActivity): boolean;
  isParentExpanded(parentId: string): boolean;
  toggleParent(parentId: string): void;
  changeStatus(activity: WorkActivity, status: WorkStatus): void;
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

  /** Passo pessoal atual (de `page.steps`) correspondente a `activity.status`. */
  currentStep(): StatusStep | undefined {
    return this.page.steps.find((step) => step.status === this.activity.status);
  }

  /**
   * Progresso pessoal em % (0–100). Os 7 passos de `page.steps` valem frações
   * iguais (~14,28% cada); estar no último passo ("No ar") equivale a 100%.
   */
  personalProgress(): number {
    const steps = this.page.steps;
    const index = steps.findIndex((step) => step.status === this.activity.status);
    if (index === -1) return 0;
    return Math.round(((index + 1) / steps.length) * 100);
  }

  onStatusSelect(event: Event): void {
    const status = (event.target as HTMLSelectElement).value as WorkStatus;
    if (status !== this.activity.status) {
      this.page.changeStatus(this.activity, status);
    }
  }
}
