import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

/**
 * Painel só-leitura com todas as regras de negócio da plataforma (derivação de
 * status pessoal a partir do Jira, bolinha de avaliação, sincronização, etc).
 * Abre por cima do diálogo do Jira. Nada aqui é editável — é apenas informativo.
 */
@Component({
  selector: 'app-platform-rules-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './platform-rules-dialog.html',
  styleUrl: './platform-rules-dialog.scss',
})
export class PlatformRulesDialog {
  private readonly ref = inject(MatDialogRef<PlatformRulesDialog>);

  close(): void {
    this.ref.close();
  }
}
