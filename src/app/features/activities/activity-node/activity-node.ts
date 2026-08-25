import { Component, Input } from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

import { WorkActivity, WorkStatus } from '../../../core/models/activity.model';

export interface StatusStep {
  status: WorkStatus;
  label: string;
  icon: string;
}

export interface ActivityTreeHost {
  readonly steps: StatusStep[];
  displayLabel(activity: WorkActivity): string;
  childrenOf(parentId: string): WorkActivity[];
  hasChildren(activity: WorkActivity): boolean;
  canHaveChildren(activity: WorkActivity): boolean;
  isParentExpanded(parentId: string): boolean;
  toggleParent(parentId: string): void;
  changeStatus(activity: WorkActivity, status: WorkStatus): void;
  remove(activity: WorkActivity): void;
  childrenListId(parentId: string): string;
  parentGroupId(id: string): string | null;
  allDropListIds(): string[];
  drop(event: CdkDragDrop<string | null>): void;
  openChildrenLinks(activity: WorkActivity): void;
  readonly editForm: FormGroup;
  isEditing(activityId: string): boolean;
  startEdit(activity: WorkActivity): void;
  cancelEdit(): void;
  saveEdit(activity: WorkActivity): void;
}

@Component({
  selector: 'app-activity-node',
  imports: [DragDropModule, ReactiveFormsModule, MatIconModule, ActivityNode],
  templateUrl: './activity-node.html',
  styleUrl: './activity-node.scss',
})
export class ActivityNode {
  @Input({ required: true }) activity!: WorkActivity;
  @Input({ required: true }) page!: ActivityTreeHost;
  @Input() depth = 1;
}
