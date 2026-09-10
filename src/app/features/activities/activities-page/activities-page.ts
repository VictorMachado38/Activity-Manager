import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
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
  { status: 'finalizado_na_maquina', label: 'Fin. na máquina', icon: 'check_circle' },
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
  private readonly document = inject(DOCUMENT);

  // Última posição do ponteiro, para o enterPredicate da lista raiz saber se um
  // filho está só sendo reordenado dentro da própria lista (ponteiro sobre uma
  // .children-list) ou realmente saindo para o nível de topo.
  private pointerX = 0;
  private pointerY = 0;

  readonly steps = STATUS_STEPS;
  readonly activities = signal<WorkActivity[]>([]);
  readonly loading = signal(true);
  readonly syncing = signal(false);
  readonly expanded = signal(true);
  readonly showForm = signal(false);
  readonly expandedParents = signal<Set<string>>(new Set());

  // Status do Jira ocultos na árvore (ex.: esconder tudo que está "Concluído").
  readonly hiddenJiraStatuses = signal<Set<string>>(new Set());

  // jira_key -> cadeia de ancestrais no momento da remoção. Enquanto a chave
  // estiver aqui, "Sinc. Jira" não recria o item. Remover um ancestral limpa os
  // descendentes (a cadeia deles contém a chave removida).
  readonly dismissedJira = signal<Record<string, string[]>>({});

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

  /**
   * enterPredicate da lista raiz. A raiz engloba geometricamente todas as
   * .children-list aninhadas, então sem isto ela "rouba" qualquer drag de filho
   * (impedindo a reordenação entre irmãos). Regra: aceita itens de topo sempre;
   * aceita um filho só quando o ponteiro não está mais sobre uma .children-list
   * (ou seja, o usuário realmente quer promovê-lo para o topo).
   */
  readonly acceptAtRoot = (drag: CdkDrag, _drop: CdkDropList): boolean => {
    const activity = drag.data as WorkActivity | undefined;
    if (!activity?.parent_id) return true;
    const el = this.document.elementFromPoint(this.pointerX, this.pointerY);
    return !el?.closest('.children-list');
  };

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

    const trackPointer = (e: PointerEvent): void => {
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
    };
    this.document.addEventListener('pointermove', trackPointer, { passive: true });
    inject(DestroyRef).onDestroy(() =>
      this.document.removeEventListener('pointermove', trackPointer),
    );
  }

  reload(): void {
    this.loading.set(true);
    this.activityService.list().subscribe((activities) => {
      this.activities.set(activities);
      this.loading.set(false);
    });
    this.activityService.getDismissedJira().subscribe((map) => this.dismissedJira.set(map ?? {}));
  }

  /** Busca o estado atual no Jira das atividades importadas e atualiza status/tipo. */
  syncWithJira(): void {
    if (this.syncing()) return;
    const keys = [
      ...new Set(
        this.activities()
          .filter((a) => a.jira_key)
          .map((a) => a.jira_key as string),
      ),
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
        this.snackBar.open(err?.error?.detail || 'Falha ao sincronizar com o Jira.', undefined, {
          duration: 5000,
        });
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
      if ((fresh.avaliacaoDev ?? null) !== (activity.jira_avaliacao ?? null)) {
        body.jira_avaliacao = fresh.avaliacaoDev ?? null;
      }
      if (Object.keys(body).length > 0) patches.push({ id: activity.id, body });
    }

    // Primeiro aplica os patches de status/tipo; só depois procura filhos novos,
    // para o diff de filhos rodar sobre a árvore já atualizada.
    if (patches.length === 0) {
      this.syncNewChildren(moves);
      return;
    }

    let remaining = patches.length;
    const done = (): void => {
      if (--remaining === 0) this.syncNewChildren(moves);
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

  /**
   * Para cada atividade-raiz importada do Jira (tem `jira_key` e não é filha de
   * outra), busca os filhos atuais no Jira e cria atividades para os que ainda
   * não existem em lugar nenhum da listagem. É isso que faz um bug novo de um
   * item já importado aparecer ao clicar em "Sinc. Jira".
   */
  private syncNewChildren(moves: string[]): void {
    const all = this.activities();
    const roots = all.filter((a) => a.jira_key && !a.parent_id);
    const knownKeys = new Set(all.filter((a) => a.jira_key).map((a) => a.jira_key as string));
    // Itens que o usuário removeu de propósito não voltam na sincronização.
    const dismissed = this.dismissedJira();

    if (roots.length === 0) {
      this.finishJiraSync(moves, 0);
      return;
    }

    let remainingRoots = roots.length;
    let pendingCreates = 0;
    let added = 0;

    const maybeFinish = (): void => {
      if (remainingRoots > 0 || pendingCreates > 0) return;
      if (added > 0) this.activityService.notifyChanged();
      this.finishJiraSync(moves, added);
    };

    for (const root of roots) {
      this.jiraService.children(root.jira_key as string).subscribe({
        next: (res) => {
          remainingRoots--;
          const newChildren = res.issues.filter(
            (child) =>
              child.key !== root.jira_key &&
              !knownKeys.has(child.key) &&
              !(child.key in dismissed),
          );
          for (const child of newChildren) {
            knownKeys.add(child.key); // evita duplicar se dois pais listarem o mesmo item
            pendingCreates++;
            this.activityService
              .create({
                title: child.key,
                jira_url: child.url,
                notes: child.summary,
                jira_key: child.key,
                jira_status: child.status,
                jira_issue_type: child.issueType,
                jira_avaliacao: child.avaliacaoDev,
                parent_id: root.id,
              })
              .subscribe({
                next: () => {
                  added++;
                  pendingCreates--;
                  maybeFinish();
                },
                error: () => {
                  pendingCreates--;
                  maybeFinish();
                },
              });
          }
          maybeFinish();
        },
        error: () => {
          remainingRoots--;
          maybeFinish();
        },
      });
    }
  }

  private finishJiraSync(moves: string[], addedChildren = 0): void {
    this.syncing.set(false);
    const parts: string[] = [];
    if (moves.length > 0) {
      const shown = moves.slice(0, 3).join('  ·  ');
      const more = moves.length > 3 ? `  (+${moves.length - 3})` : '';
      parts.push(`${moves.length} card(s) mudaram de status:  ${shown}${more}`);
    }
    if (addedChildren > 0) {
      parts.push(`${addedChildren} novo(s) filho(s) importado(s) do Jira.`);
    }
    this.snackBar.open(
      parts.length > 0 ? parts.join('   |   ') : 'Sincronizado — nada mudou.',
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
    this.activityService
      .create({ title, jira_url: url, notes, parent_id: parentId })
      .subscribe(() => {
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
    // Só os filhos visíveis: respeita o filtro "Ocultar status".
    const children = this.visibleChildrenOf(activity.id);
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

  /**
   * Abre de uma vez toda a subárvore de `activity`: expande o próprio item e
   * cada descendente que ainda tenha filhos visíveis (respeita o filtro
   * "Ocultar status"). É o botão "abrir todos os filhos" do pai principal.
   */
  expandAllDescendants(activity: WorkActivity): void {
    const toExpand: string[] = [];
    const walk = (parentId: string): void => {
      const visibleKids = this.visibleChildrenOf(parentId);
      if (visibleKids.length === 0) return;
      toExpand.push(parentId);
      for (const child of visibleKids) walk(child.id);
    };
    walk(activity.id);
    if (toExpand.length === 0) return;

    this.expandedParents.update((current) => {
      const next = new Set(current);
      for (const id of toExpand) next.add(id);
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

    // `event.*Index` são posições na lista RENDERIZADA. A raiz mostra tudo; as
    // listas de filhos aplicam "Ocultar status". Trabalhamos sobre a lista
    // visível e depois recompomos a lista completa preservando os ocultos.
    const fromFull =
      fromParent === null ? [...this.topLevelActivities()] : [...this.childrenOf(fromParent)];
    const fromVisible = this.visibleSlice(fromParent, fromFull);
    const overrides = new Map<string | null, WorkActivity[]>();

    if (event.previousContainer === event.container) {
      if (event.previousIndex === event.currentIndex) return;
      moveItemInArray(fromVisible, event.previousIndex, event.currentIndex);
      overrides.set(fromParent, this.mergeVisibleOrder(fromParent, fromFull, fromVisible));
    } else {
      const toFull =
        toParent === null ? [...this.topLevelActivities()] : [...this.childrenOf(toParent)];
      const toVisible = this.visibleSlice(toParent, toFull);
      transferArrayItem(fromVisible, toVisible, event.previousIndex, event.currentIndex);
      const movedIndex = toVisible.findIndex((item) => item.id === moved.id);
      toVisible[movedIndex] = { ...toVisible[movedIndex], parent_id: toParent };
      overrides.set(fromParent, this.mergeVisibleOrder(fromParent, fromFull, fromVisible));
      overrides.set(toParent, this.mergeVisibleOrder(toParent, toFull, toVisible));
      if (toParent) {
        this.expandedParents.update((current) => new Set(current).add(toParent));
      }
      this.activityService.update(moved.id, { parent_id: toParent }).subscribe();
    }

    const updated = this.flattenWithOverrides(overrides);
    this.activities.set(updated);
    this.activityService.reorder(updated.map((item) => item.id)).subscribe();
  }

  /** Itens de `full` como aparecem na tela: raiz não filtra, filhos aplicam "Ocultar status". */
  private visibleSlice(parentId: string | null, full: WorkActivity[]): WorkActivity[] {
    return parentId === null ? [...full] : full.filter((a) => !this.isJiraHidden(a));
  }

  /**
   * Recompõe a lista completa a partir de um reordenamento feito só sobre os
   * itens visíveis: cada vaga visível recebe o próximo item de `visible`, na
   * ordem; os ocultos ficam onde estavam. Sobras de `visible` (item que entrou
   * por transferência) vão para o fim.
   */
  private mergeVisibleOrder(
    parentId: string | null,
    full: WorkActivity[],
    visible: WorkActivity[],
  ): WorkActivity[] {
    const isHidden = (a: WorkActivity): boolean => parentId !== null && this.isJiraHidden(a);
    let vi = 0;
    const out = full.map((item) => (isHidden(item) ? item : visible[vi++]));
    while (vi < visible.length) out.push(visible[vi++]);
    return out;
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
    this.activityService
      .update(activity.id, { title, jira_url: url, notes })
      .subscribe((updated) => {
        this.activities.update((list) =>
          list.map((item) => (item.id === updated.id ? updated : item)),
        );
        this.editingId.set(null);
      });
  }

  /** A atividade + todos os descendentes (filhos, netos…). */
  private subtreeOf(id: string): WorkActivity[] {
    const ids = new Set<string>([id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const a of this.activities()) {
        if (a.parent_id && ids.has(a.parent_id) && !ids.has(a.id)) {
          ids.add(a.id);
          grew = true;
        }
      }
    }
    return this.activities().filter((a) => ids.has(a.id));
  }

  /** Nº de descendentes (filhos, netos…) de uma atividade. */
  private descendantCount(id: string): number {
    return this.subtreeOf(id).length - 1;
  }

  /** jira_keys dos ancestrais de `activity` (pai, avô, … até a raiz). */
  private jiraAncestorKeys(activity: WorkActivity): string[] {
    const byId = new Map(this.activities().map((a) => [a.id, a]));
    const chain: string[] = [];
    let current = activity.parent_id ? byId.get(activity.parent_id) : undefined;
    while (current) {
      if (current.jira_key) chain.push(current.jira_key);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    return chain;
  }

  /**
   * Ao remover uma atividade do Jira, marca a subárvore removida para a
   * sincronização não recriá-la. Ao remover um ancestral, as marcações dos
   * descendentes são descartadas (a cadeia deles contém a chave removida), então
   * eles voltam no próximo "Sinc. Jira".
   */
  private updateDismissedOnRemove(activity: WorkActivity): void {
    const subtree = this.subtreeOf(activity.id);
    const subtreeKeys = new Set(subtree.filter((n) => n.jira_key).map((n) => n.jira_key as string));
    if (subtreeKeys.size === 0) return;

    // Sempre: descarta marcações que estavam dentro do ramo removido — assim,
    // ao remover um ancestral, os descendentes voltam na próxima sincronização.
    const next: Record<string, string[]> = {};
    for (const [key, chain] of Object.entries(this.dismissedJira())) {
      if (subtreeKeys.has(key) || chain.some((c) => subtreeKeys.has(c))) continue;
      next[key] = chain;
    }

    // Só marca como removido quando ainda existe um ancestral no Jira que a
    // sincronização visita. Remover uma raiz já é permanente (a sincronização
    // nunca recria raízes), então não precisa marcar nada da subárvore dela.
    if (activity.parent_id) {
      for (const node of subtree) {
        if (!node.jira_key) continue;
        next[node.jira_key] = this.jiraAncestorKeys(node);
      }
    }

    this.dismissedJira.set(next);
    this.activityService.setDismissedJira(next).subscribe();
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
      if (!confirmed) return;
      this.updateDismissedOnRemove(activity);
      this.activityService.delete(activity.id).subscribe(() => this.reload());
    });
  }
}
