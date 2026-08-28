import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { JiraIssue } from '../../core/models/jira-issue.model';
import { ActivityService } from '../../core/services/activity.service';
import { JiraService } from '../../core/services/jira.service';
import { jiraStatusClass } from '../../core/utils/jira-status';
import { JiraChildrenDialog } from '../jira-children-dialog/jira-children-dialog';

@Component({
  selector: 'app-jira-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './jira-dialog.html',
  styleUrl: './jira-dialog.scss',
})
export class JiraDialog {
  private readonly ref = inject(MatDialogRef<JiraDialog>);
  private readonly jiraService = inject(JiraService);
  private readonly activityService = inject(ActivityService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly issueTypes = ['Item de Trabalho', 'Bug'];
  readonly selectedType = signal<string>('Item de Trabalho');

  readonly issues = signal<JiraIssue[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly importingKey = signal<string | null>(null);
  readonly importedKeys = signal<Set<string>>(new Set());

  // Filtro de status (client-side). '' = todos. As opções são os status
  // realmente presentes no resultado atual.
  readonly statusFilter = signal<string>('');

  readonly availableStatuses = computed(() =>
    [...new Set(this.issues().map((i) => i.status).filter((s): s is string => !!s))].sort((a, b) =>
      a.localeCompare(b),
    ),
  );

  readonly visibleIssues = computed(() => {
    const status = this.statusFilter();
    return status ? this.issues().filter((i) => i.status === status) : this.issues();
  });

  constructor() {
    this.load();
  }

  changeType(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === this.selectedType()) return;
    this.selectedType.set(value);
    this.load();
  }

  changeStatusFilter(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value);
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.statusFilter.set('');
    this.jiraService.myItems(this.selectedType()).subscribe({
      next: (res) => {
        this.issues.set(res.issues);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.detail || 'Não foi possível consultar o Jira.');
        this.loading.set(false);
      },
    });
    this.activityService.list().subscribe((activities) => {
      const keys = activities.filter((a) => a.jira_key).map((a) => a.jira_key as string);
      this.importedKeys.set(new Set(keys));
    });
  }

  openChildren(issue: JiraIssue): void {
    this.dialog.open(JiraChildrenDialog, {
      width: '900px',
      maxWidth: '95vw',
      data: { key: issue.key, summary: issue.summary },
    });
  }

  statusClass(issue: JiraIssue): string {
    return jiraStatusClass(issue);
  }

  isImporting(issue: JiraIssue): boolean {
    return this.importingKey() === issue.key;
  }

  isImported(issue: JiraIssue): boolean {
    return this.importedKeys().has(issue.key);
  }

  addToActivities(issue: JiraIssue): void {
    if (this.importingKey() || this.isImported(issue)) return;
    this.importingKey.set(issue.key);

    this.jiraService.children(issue.key).subscribe({
      next: (childrenRes) => {
        this.activityService
          .create({
            title: issue.key,
            jira_url: issue.url,
            notes: issue.summary,
            jira_key: issue.key,
            jira_status: issue.status,
            jira_issue_type: issue.issueType,
          })
          .subscribe({
            next: (parent) => this.createChildren(issue.key, parent.id, childrenRes.issues),
            error: () => this.failImport('Não foi possível adicionar às Atividades.'),
          });
      },
      error: () => this.failImport('Não foi possível consultar os filhos no Jira.'),
    });
  }

  private createChildren(parentKey: string, parentId: string, children: JiraIssue[]): void {
    if (children.length === 0) {
      this.finishImport(parentKey, 0, false);
      return;
    }

    let remaining = children.length;
    let hadErrors = false;

    for (const child of children) {
      this.activityService
        .create({
          title: child.key,
          jira_url: child.url,
          notes: child.summary,
          jira_key: child.key,
          jira_status: child.status,
          jira_issue_type: child.issueType,
          parent_id: parentId,
        })
        .subscribe({
          next: () => {
            remaining--;
            if (remaining === 0) this.finishImport(parentKey, children.length, hadErrors);
          },
          error: () => {
            remaining--;
            hadErrors = true;
            if (remaining === 0) this.finishImport(parentKey, children.length, hadErrors);
          },
        });
    }
  }

  private finishImport(key: string, childCount: number, hadErrors: boolean): void {
    this.importingKey.set(null);
    this.importedKeys.update((current) => new Set(current).add(key));
    this.activityService.notifyChanged();
    const suffix = childCount > 0 ? ` (+${childCount} filho${childCount > 1 ? 's' : ''})` : '';
    this.snackBar.open(
      hadErrors
        ? `"${key}" adicionado, mas alguns filhos falharam.`
        : `"${key}" adicionado às Atividades${suffix}.`,
      undefined,
      { duration: 3000 },
    );
  }

  private failImport(message: string): void {
    this.importingKey.set(null);
    this.snackBar.open(message, undefined, { duration: 3000 });
  }

  close(): void {
    this.ref.close();
  }
}
