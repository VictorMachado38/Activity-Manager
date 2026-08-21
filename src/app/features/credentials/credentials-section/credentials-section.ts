import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AppCredential } from '../../../core/models/credential.model';
import { CredentialService } from '../../../core/services/credential.service';

@Component({
  selector: 'app-credentials-section',
  imports: [ReactiveFormsModule],
  templateUrl: './credentials-section.html',
  styleUrl: './credentials-section.scss',
})
export class CredentialsSection {
  private readonly fb = inject(FormBuilder);
  private readonly credentialService = inject(CredentialService);
  private readonly snackBar = inject(MatSnackBar);

  readonly credentials = signal<AppCredential[]>([]);
  readonly loading = signal(true);
  readonly expanded = signal(true);
  readonly showForm = signal(false);
  readonly revealed = signal<Set<string>>(new Set());

  readonly form = this.fb.group({
    app: ['', Validators.required],
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.credentialService.list().subscribe((credentials) => {
      this.credentials.set(credentials);
      this.loading.set(false);
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.credentialService
      .create({ app: raw.app!, username: raw.username!, password: raw.password! })
      .subscribe(() => {
        this.form.reset();
        this.showForm.set(false);
        this.reload();
      });
  }

  remove(id: string): void {
    this.credentialService.delete(id).subscribe(() => this.reload());
  }

  toggleReveal(id: string): void {
    this.revealed.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  isRevealed(id: string): boolean {
    return this.revealed().has(id);
  }

  async copy(value: string, label: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.snackBar.open(`${label} copiado`, undefined, { duration: 1500 });
    } catch {
      this.snackBar.open('Não foi possível copiar', undefined, { duration: 1500 });
    }
  }
}
