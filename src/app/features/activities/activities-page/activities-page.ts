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
import { WorkActivity, WorkActivityUpdate, WorkStatus } from '../../../core/models/activity.model';
import { JiraIssue } from '../../../core/models/jira-issue.model';
import { ActivityService } from '../../../core/services/activity.service';
import { JiraService } from '../../../core/services/jira.service';
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
  private readonly jiraService = inject(JiraService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly steps = STATUS_STEPS;
  readonly activities = signal<WorkActivity[]>([]);
  readonly loading = signal(true);
  readonly syncing = signal(false);
  readonly expanded = signal(true);
  readonly showForm = signal(false);
  readonly expandedParents = signal<Set<string>>(new Set());

  // Status do Jira ocultos na árvore (ex.: esconder tudo que está "Concluído").
  readonly hiddenJiraStatuses = signal<Set<string>>(new Set());

  readonly topLevelActivities = computed(() => this.activities().filter((a) => !a.parent_id));

  // Status do Jira presentes nos FILHOS, para montar os chips de "Ocultar status"
  // (o filtro só esconde filhos; os itens de topo continuam sempre visíveis).
  readonly jiraStatusesInTree = computed(() =>
    [
      ...new Set(
        this.activities()
          .filter((a) => a.parent_id && a.jira_key && a.jira_status)
          .map((a) => a.jira_status as string),
      ),
    ].sort((a, b) => a.localeCompare(b)),
  );

  // Com filtro ativo a lista exibida difere da real; desliga o drag para os
  // índices não saírem de sincronia.
  readonly dragDisabled = computed(() => this.hiddenJiraStatuses().size > 0);

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

  /** Busca o estado atual no Jira das atividades importadas e atualiza status/tipo. */
  syncWithJira(): void {
    if (this.syncing()) return;
    const keys = [
      ...new Set(this.activities().filter((a) => a.jira_key).map((a) => a.jira_key as string)),
    ];
    if (keys.length === 0) {
      this.snackBar.open('Nenhuma atividade importada do Jira.', undefined, { duration: 3000 });
      return;
    }
    this.syncing.set(true);
    this.jiraService.syncIssues(keys).subscribe({
      next: (res) => this.applyJiraSync(res.issues),
      error: (err) => {
        this.syncing.set(false);
        this.snackBar.open(
          err?.error?.detail || 'Falha ao sincronizar com o Jira.',
          undefined,
          { duration: 5000 },
        );
      },
    });
  }

  private applyJiraSync(issues: JiraIssue[]): void {
    const byKey = new Map(issues.map((i) => [i.key, i]));
    const moves: string[] = [];
    const patches: { id: string; body: WorkActivityUpdate }[] = [];

    for (const activity of this.activities()) {
      if (!activity.jira_key) continue;
      const fresh = byKey.get(activity.jira_key);
      if (!fresh) continue;

      const body: WorkActivityUpdate = {};
      if ((fresh.status ?? null) !== activity.jira_status) {
        body.jira_status = fresh.status ?? null;
        moves.push(`${activity.jira_key}: ${activity.jira_status ?? '—'} → ${fresh.status ?? '—'}`);
      }
      if ((fresh.issueType ?? null) !== activity.jira_issue_type) {
        body.jira_issue_type = fresh.issueType ?? null;
      }
      if (Object.keys(body).length > 0) patches.push({ id: activity.id, body });
    }

    if (patches.length === 0) {
      this.syncing.set(false);
      this.snackBar.open('Tudo já estava sincronizado com o Jira.', undefined, { duration: 3000 });
      return;
    }

    let remaining = patches.length;
    const done = (): void => {
      if (--remaining === 0) this.finishJiraSync(moves);
    };
    for (const patch of patches) {
      this.activityService.update(patch.id, patch.body).subscribe({
        next: (updated) => {
          this.activities.update((list) =>
            list.map((item) => (item.id === updated.id ? updated : item)),
          );
          done();
        },
        error: done,
      });
    }
  }

  private finishJiraSync(moves: string[]): void {
    this.syncing.set(false);
    if (moves.length === 0) {
      this.snackBar.open('Sincronizado (nenhum card mudou de status).', undefined, { duration: 4000 });
      return;
    }
    const shown = moves.slice(0, 3).join('  ·  ');
    const more = moves.length > 3 ? `  (+${moves.length - 3})` : '';
    this.snackBar.open(
      `${moves.length} card(s) mudaram de status:  ${shown}${more}`,
      undefined,
      { duration: 8000 },
    );
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

  /** Filhos visíveis (aplica o filtro "Ocultar status"). Só para exibição — o
   * drag continua usando `childrenOf` e fica desabilitado enquanto há filtro. */
  visibleChildrenOf(parentId: string): WorkActivity[] {
    return this.childrenOf(parentId).filter((c) => !this.isJiraHidden(c));
  }

  isJiraHidden(activity: WorkActivity): boolean {
    return !!activity.jira_status && this.hiddenJiraStatuses().has(activity.jira_status);
  }

  isJiraStatusHidden(status: string): boolean {
    return this.hiddenJiraStatuses().has(status);
  }

  toggleHiddenJiraStatus(status: string): void {
    this.hiddenJiraStatuses.update((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
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

  /** Nº de descendentes (filhos, netos…) de uma atividade. */
  private descendantCount(id: string): number {
    const ids = new Set([id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const a of this.activities()) {
        if (a.parent_id && ids.has(a.parent_id) && !ids.has(a.id)) {
          ids.add(a.id);
          grew = true;
        }
      }
    }
    return ids.size - 1;
  }

  remove(activity: WorkActivity): void {
    const linked = this.descendantCount(activity.id);
    const message =
      linked > 0
        ? `Excluir "${activity.title}" e ${linked} item(ns) vinculado(s)? Essa ação não pode ser desfeita.`
        : `Excluir "${activity.title}"? Essa ação não pode ser desfeita.`;
    const ref = this.dialog.open(ConfirmDialog, {
      data: { title: 'Excluir atividade', message },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.activityService.delete(activity.id).subscribe(() => this.reload());
      }
    });
  }
}
