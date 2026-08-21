import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { WorkActivity, WorkStatus } from '../../../core/models/activity.model';
import { ActivityService } from '../../../core/services/activity.service';
import { extractJiraKey } from '../../../core/utils/extract-jira-key';

interface StatusStep {
  status: WorkStatus;
  label: string;
  icon: string;
}

const STATUS_STEPS: StatusStep[] = [
  { status: 'a_fazer', label: 'A fazer', icon: 'assignment' },
  { status: 'na_maquina', label: 'Na máquina', icon: 'computer' },
  { status: 'no_repositorio', label: 'No repositório', icon: 'account_tree' },
  { status: 'para_deploy', label: 'Para deploy', icon: 'rocket_launch' },
  { status: 'testando', label: 'Testando', icon: 'science' },
  { status: 'no_ar', label: 'No ar', icon: 'public' },
];

@Component({
  selector: 'app-activities-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './activities-page.html',
  styleUrl: './activities-page.scss',
})
export class ActivitiesPage {
  private readonly fb = inject(FormBuilder);
  private readonly activityService = inject(ActivityService);
  private readonly dialog = inject(MatDialog);

  readonly steps = STATUS_STEPS;
  readonly activities = signal<WorkActivity[]>([]);
  readonly loading = signal(true);
  readonly expanded = signal(true);
  readonly showForm = signal(false);

  readonly form = this.fb.group({
    jira_url: ['', Validators.required],
    notes: [''],
  });

  constructor() {
    this.reload();
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
    this.activityService.create({ title, jira_url: url, notes }).subscribe(() => {
      this.form.reset();
      this.showForm.set(false);
      this.reload();
    });
  }

  displayLabel(activity: WorkActivity): string {
    return activity.notes ? `${activity.title} - ${activity.notes}` : activity.title;
  }

  changeStatus(activity: WorkActivity, status: WorkStatus): void {
    if (activity.status === status) return;
    this.activityService.update(activity.id, { status }).subscribe(() => this.reload());
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
