import { Component, Input } from '@angular/core';
import { CdkDrag, CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
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
  childrenListId(parentId: string): string;
  parentGroupId(id: string): string | null;
  allDropListIds(): string[];
  drop(event: CdkDragDrop<string | null>): void;
  visibleChildrenOf(parentId: string): WorkActivity[];
  isJiraHidden(activity: WorkActivity): boolean;
  dragDisabled(): boolean;
}

@Component({
  selector: 'app-jira-activity-node',
  imports: [DragDropModule, MatIconModule, JiraActivityNode],
  templateUrl: './jira-activity-node.html',
  styleUrl: './jira-activity-node.scss',
})
export class JiraActivityNode {
  @Input({ required: true }) activity!: WorkActivity;
  @Input({ required: true }) page!: JiraActivityTreeHost;
  @Input() depth = 1;

  // Lista de filhos só aceita outros itens do Jira (a subárvore é renderizada
  // por tipo). O reordenamento livre entre os dois tipos acontece na raiz.
  protected readonly acceptDrag = (drag: CdkDrag): boolean =>
    !!(drag.data as WorkActivity | undefined)?.jira_key;

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

  /** Bug concluído no Jira = está no último passo do fluxo mapeado. */
  private jiraDone(): boolean {
    const wf = this.workflow();
    return !!wf && wf.currentIndex === wf.steps.length - 1;
  }

  /**
   * Status pessoal exibido na barra/combo. Se o Bug já está "Concluído" no Jira
   * e o status pessoal ainda é o inicial ("a_fazer"), mostra como "No ar" (100%).
   * Assim que o usuário escolhe algo no combo, passa a valer a escolha real.
   */
  effectiveStatus(): WorkStatus {
    if (this.jiraDone() && this.activity.status === 'a_fazer') return 'no_ar';
    return this.activity.status;
  }

  /** Passo pessoal atual (de `page.steps`) correspondente ao status efetivo. */
  currentStep(): StatusStep | undefined {
    return this.page.steps.find((step) => step.status === this.effectiveStatus());
  }

  /**
   * Progresso pessoal em % (0–100). Os 7 passos de `page.steps` valem frações
   * iguais (~14,28% cada); estar no último passo ("No ar") equivale a 100%.
   */
  personalProgress(): number {
    const steps = this.page.steps;
    const index = steps.findIndex((step) => step.status === this.effectiveStatus());
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
