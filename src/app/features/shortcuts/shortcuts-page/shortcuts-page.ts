import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { ShortcutLink } from '../../../core/models/shortcut.model';
import { ShortcutService } from '../../../core/services/shortcut.service';

@Component({
  selector: 'app-shortcuts-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './shortcuts-page.html',
  styleUrl: './shortcuts-page.scss',
})
export class ShortcutsPage {
  private readonly fb = inject(FormBuilder);
  private readonly shortcutService = inject(ShortcutService);
  private readonly dialog = inject(MatDialog);

  readonly shortcuts = signal<ShortcutLink[]>([]);
  readonly loading = signal(true);
  readonly expanded = signal(true);
  readonly showForm = signal(false);

  readonly form = this.fb.group({
    label: ['', Validators.required],
    url: ['', Validators.required],
    image_url: [''],
  });

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.shortcutService.list().subscribe((shortcuts) => {
      this.shortcuts.set(shortcuts);
      this.loading.set(false);
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.shortcutService
      .create({ label: raw.label!, url: raw.url!, image_url: raw.image_url || null })
      .subscribe(() => {
        this.form.reset();
        this.showForm.set(false);
        this.reload();
      });
  }

  initial(label: string): string {
    return label.trim().charAt(0).toUpperCase();
  }

  remove(shortcut: ShortcutLink): void {
    const ref = this.dialog.open(ConfirmDialog, {
      data: {
        title: 'Excluir atalho',
        message: `Excluir "${shortcut.label}"?`,
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.shortcutService.delete(shortcut.id).subscribe(() => this.reload());
      }
    });
  }
}
