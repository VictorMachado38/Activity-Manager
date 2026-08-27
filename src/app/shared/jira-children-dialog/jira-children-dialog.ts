import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { JiraIssue } from '../../core/models/jira-issue.model';
import { JiraService } from '../../core/services/jira.service';
import { jiraStatusClass } from '../../core/utils/jira-status';

export interface JiraChildrenDialogData {
  key: string;
  summary: string;
}

@Component({
  selector: 'app-jira-children-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './jira-children-dialog.html',
  styleUrl: './jira-children-dialog.scss',
})
export class JiraChildrenDialog {
  private readonly ref = inject(MatDialogRef<JiraChildrenDialog>);
  private readonly jiraService = inject(JiraService);
  readonly data = inject<JiraChildrenDialogData>(MAT_DIALOG_DATA);

  readonly issues = signal<JiraIssue[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.jiraService.children(this.data.key).subscribe({
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

  statusClass(issue: JiraIssue): string {
    return jiraStatusClass(issue);
  }

  close(): void {
    this.ref.close();
  }
}
