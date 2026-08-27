import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { JiraIssue } from '../../core/models/jira-issue.model';
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
  private readonly dialog = inject(MatDialog);

  readonly issues = signal<JiraIssue[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.jiraService.myItems().subscribe({
      next: (res) => {
        this.issues.set(res.issues);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.detail || 'Não foi possível consultar o Jira.');
        this.loading.set(false);
      },
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

  close(): void {
    this.ref.close();
  }
}
