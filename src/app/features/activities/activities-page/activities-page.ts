import { Component, computed, effect, inject, signal } from '@angular/core';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { WorkActivity, WorkStatus } from '../../../core/models/activity.model';
import { ActivityService } from '../../../core/services/activity.service';
import { extractJiraKey } from '../../../core/utils/extract-jira-key';
import { ActivityNode, ActivityTreeHost, StatusStep } from '../activity-node/activity-node';
import { JiraActivityNode } from '../jira-activity-node/jira-activity-node';

const MAX_DEPTH = 3;

const STATUS_STEPS: StatusStep[] = [
  { status: 'a_fazer', label: 'A fazer', icon: 'assignment' },
  { status: 'na_maquina', label: 'Na máquina', icon: 'computer' },
  { status: 'finalizado_na_maquina', label: 'Finalizado na máquina', icon: 'check_circle' },
  { status: 'no_repositorio', label: 'No repositório', icon: 'account_tree' },
  { status: 'para_deploy', label: 'Para deploy', icon: 'rocket_launch' },
  { status: 'testando', label: 'Testando', icon: 'science' },
  { status: 'no_ar', label: 'No ar', icon: 'public' },
];

@Component({
  selector: 'app-activities-page',
  imports: [
    ReactiveFormsModule,
    DragDropModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ActivityNode,
    JiraActivityNode,
  ],
  templateUrl: './activities-page.html',
  styleUrl: './activities-page.scss',
})
export class ActivitiesPage implements ActivityTreeHost {
  private readonly fb = inject(FormBuilder);
  private readonly activityService = inject(ActivityService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly steps = STATUS_STEPS;
  readonly activities = signal<WorkActivity[]>([]);
  readonly loading = signal(true);
  readonly expanded = signal(true);
  readonly showForm = signal(false);
  readonly expandedParents = signal<Set<string>>(new Set());

  readonly topLevelActivities = computed(() => this.activities().filter((a) => !a.parent_id));

  readonly childrenByParent = computed(() => {
    const map = new Map<string, WorkActivity[]>();
    for (const activity of this.activities()) {
      if (!activity.parent_id) continue;
      const siblings = map.get(activity.parent_id) ?? [];
      siblings.push(activity);
      map.set(activity.parent_id, siblings);
    }
    return map;
  });

  readonly selectableParents = computed(() =>
    this.activities().filter((a) => this.depthOf(a) < MAX_DEPTH),
  );

  readonly rootGroupId: string | null = null;
  readonly editingId = signal<string | null>(null);

  readonly form = this.fb.group({
    jira_url: ['', Validators.required],
    notes: [''],
    parent_id: [''],
  });

  readonly editForm = this.fb.group({
    jira_url: ['', Validators.required],
    notes: [''],
  });

  constructor() {
    effect(() => {
      this.activityService.changed();
      this.reload();
    });
  }

  reload(): void {
    this.loading.set(true);
    this.activityService.list().subscribe((activities) => {
      this.activities.set(activities);
      this.loading.set(false);
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const url = raw.jira_url!.trim();
    const title = extractJiraKey(url) ?? url;
    const notes = raw.notes?.trim() || null;
    const parentId = raw.parent_id || null;
    this.activityService.create({ title, jira_url: url, notes, parent_id: parentId }).subscribe(() => {
      this.form.reset();
      this.showForm.set(false);
      this.reload();
    });
  }

  displayLabel(activity: WorkActivity): string {
    return activity.notes ? `${activity.title} - ${activity.notes}` : activity.title;
  }

  parentIndent(activity: WorkActivity): string {
    return '—'.repeat(this.depthOf(activity) - 1);
  }

  depthOf(activity: WorkActivity): number {
    const byId = new Map(this.activities().map((a) => [a.id, a]));
    let depth = 1;
    let current = activity;
    while (current.parent_id) {
      const parent = byId.get(current.parent_id);
      if (!parent) break;
      depth++;
      current = parent;
    }
    return depth;
  }

  canHaveChildren(activity: WorkActivity): boolean {
    return this.depthOf(activity) < MAX_DEPTH;
  }

  parentGroupId(id: string): string | null {
    return id;
  }

  childrenListId(parentId: string): string {
    return `children-${parentId}`;
  }

  allDropListIds(): string[] {
    const byId = new Map(this.activities().map((a) => [a.id, a]));
    const parentIds = Array.from(this.expandedParents()).sort((a, b) => {
      const activityA = byId.get(a);
      const activityB = byId.get(b);
      const depthA = activityA ? this.depthOf(activityA) : 0;
      const depthB = activityB ? this.depthOf(activityB) : 0;
      return depthB - depthA;
    });
    return [...parentIds.map((id) => this.childrenListId(id)), 'root-drop-list'];
  }

  childrenOf(parentId: string): WorkActivity[] {
    return this.childrenByParent().get(parentId) ?? [];
  }

  hasChildren(activity: WorkActivity): boolean {
    return this.childrenOf(activity.id).length > 0;
  }

  openChildrenLinks(activity: WorkActivity): void {
    const children = this.childrenOf(activity.id);
    let blocked = 0;
    for (const child of children) {
      const win = window.open(child.jira_url, '_blank', 'noopener');
      if (!win) blocked++;
    }
    if (blocked > 0) {
      this.snackBar.open(
        `${blocked} de ${children.length} guias foram bloqueadas pelo navegador. Permita pop-ups para este site (ícone na barra de endereço) e tente de novo.`,
        undefined,
        { duration: 6000 },
      );
    }
  }

  isParentExpanded(parentId: string): boolean {
    return this.expandedParents().has(parentId);
  }

  toggleParent(parentId: string): void {
    this.expandedParents.update((current) => {
      const next = new Set(current);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  }

  changeStatus(activity: WorkActivity, status: WorkStatus): void {
    if (activity.status === status) return;
    this.activityService.update(activity.id, { status }).subscribe((updated) => {
      this.activities.update((list) =>
        list.map((item) => (item.id === updated.id ? updated : item)),
      );
    });
  }

  drop(event: CdkDragDrop<string | null>): void {
    const moved = event.item.data as WorkActivity;
    const fromParent = event.previousContainer.data as string | null;
    const toParent = event.container.data as string | null;

    const fromList =
      fromParent === null ? [...this.topLevelActivities()] : [...this.childrenOf(fromParent)];
    const overrides = new Map<string | null, WorkActivity[]>();

    if (event.previousContainer === event.container) {
      if (event.previousIndex === event.currentIndex) return;
      moveItemInArray(fromList, event.previousIndex, event.currentIndex);
      overrides.set(fromParent, fromList);
    } else {
      const toList =
        toParent === null ? [...this.topLevelActivities()] : [...this.childrenOf(toParent)];
      transferArrayItem(fromList, toList, event.previousIndex, event.currentIndex);
      const movedIndex = toList.findIndex((item) => item.id === moved.id);
      toList[movedIndex] = { ...toList[movedIndex], parent_id: toParent };
      overrides.set(fromParent, fromList);
      overrides.set(toParent, toList);
      if (toParent) {
        this.expandedParents.update((current) => new Set(current).add(toParent));
      }
      this.activityService.update(moved.id, { parent_id: toParent }).subscribe();
    }

    const updated = this.flattenWithOverrides(overrides);
    this.activities.set(updated);
    this.activityService.reorder(updated.map((item) => item.id)).subscribe();
  }

  private flattenWithOverrides(overrides: Map<string | null, WorkActivity[]>): WorkActivity[] {
    const result: WorkActivity[] = [];
    const emit = (parentId: string | null): void => {
      const list =
        overrides.get(parentId) ??
        (parentId === null ? this.topLevelActivities() : this.childrenOf(parentId));
      for (const item of list) {
        result.push(item);
        emit(item.id);
      }
    };
    emit(null);
    return result;
  }

  isEditing(activityId: string): boolean {
    return this.editingId() === activityId;
  }

  startEdit(activity: WorkActivity): void {
    this.editingId.set(activity.id);
    this.editForm.setValue({ jira_url: activity.jira_url, notes: activity.notes ?? '' });
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  saveEdit(activity: WorkActivity): void {
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const raw = this.editForm.getRawValue();
    const url = raw.jira_url!.trim();
    const title = extractJiraKey(url) ?? url;
    const notes = raw.notes?.trim() || null;
    this.activityService.update(activity.id, { title, jira_url: url, notes }).subscribe((updated) => {
      this.activities.update((list) =>
        list.map((item) => (item.id === updated.id ? updated : item)),
      );
      this.editingId.set(null);
    });
  }

  remove(activity: WorkActivity): void {
    const ref = this.dialog.open(ConfirmDialog, {
      data: {
        title: 'Excluir atividade',
        message: `Excluir "${activity.title}"? Essa ação não pode ser desfeita.`,
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.activityService.delete(activity.id).subscribe(() => this.reload());
      }
    });
  }
}
