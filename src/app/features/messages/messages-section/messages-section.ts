import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { MatDialog } from '@angular/material/dialog';
import { MessageSnippet } from '../../../core/models/message-snippet.model';
import { MessageSnippetService } from '../../../core/services/message-snippet.service';

@Component({
  selector: 'app-messages-section',
  imports: [ReactiveFormsModule],
  templateUrl: './messages-section.html',
  styleUrl: './messages-section.scss',
})
export class MessagesSection {
  private readonly messageService = inject(MessageSnippetService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly sanitizer = inject(DomSanitizer);

  readonly messages = signal<MessageSnippet[]>([]);
  readonly loading = signal(true);
  readonly expanded = signal(true);
  readonly showForm = signal(false);
  readonly editingId = signal<string | null>(null);

  readonly labelControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });

  readonly editLabelControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.messageService.list().subscribe((messages) => {
      this.messages.set(messages);
      this.loading.set(false);
    });
  }

  onSubmit(event: Event, pasteArea: HTMLDivElement): void {
    event.preventDefault();
    this.submit(pasteArea);
  }

  submit(pasteArea: HTMLDivElement): void {
    const label = this.labelControl.value.trim();
    const html = pasteArea.innerHTML.trim();
    const text = pasteArea.innerText.trim();

    if (!label || !html) {
      this.labelControl.markAsTouched();
      return;
    }

    this.messageService.create({ label, html, text }).subscribe(() => {
      this.labelControl.reset('');
      pasteArea.innerHTML = '';
      this.showForm.set(false);
      this.reload();
    });
  }

  tooltipFor(message: MessageSnippet): string {
    return `${message.label}\n\n${message.text || ''}`;
  }

  trustedHtml(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  isEditing(id: string): boolean {
    return this.editingId() === id;
  }

  startEdit(message: MessageSnippet): void {
    this.editingId.set(message.id);
    this.editLabelControl.setValue(message.label);
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  onEditSubmit(event: Event, message: MessageSnippet, pasteArea: HTMLDivElement): void {
    event.preventDefault();
    this.saveEdit(message, pasteArea);
  }

  saveEdit(message: MessageSnippet, pasteArea: HTMLDivElement): void {
    const label = this.editLabelControl.value.trim();
    const html = pasteArea.innerHTML.trim();
    const text = pasteArea.innerText.trim();

    if (!label || !html) {
      this.editLabelControl.markAsTouched();
      return;
    }

    this.messageService.update(message.id, { label, html, text }).subscribe((updated) => {
      this.messages.update((list) =>
        list.map((item) => (item.id === updated.id ? updated : item)),
      );
      this.editingId.set(null);
    });
  }

  async copy(message: MessageSnippet): Promise<void> {
    try {
      const item = new ClipboardItem({
        'text/html': new Blob([message.html], { type: 'text/html' }),
        'text/plain': new Blob([message.text || message.html], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      this.snackBar.open(`"${message.label}" copiada`, undefined, { duration: 1500 });
    } catch {
      try {
        await navigator.clipboard.writeText(message.text || message.html);
        this.snackBar.open(`"${message.label}" copiada (texto simples)`, undefined, {
          duration: 1500,
        });
      } catch {
        this.snackBar.open('Não foi possível copiar', undefined, { duration: 1500 });
      }
    }
  }

  remove(message: MessageSnippet): void {
    const ref = this.dialog.open(ConfirmDialog, {
      data: {
        title: 'Excluir mensagem',
        message: `Excluir "${message.label}"?`,
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.messageService.delete(message.id).subscribe(() => this.reload());
      }
    });
  }
}
