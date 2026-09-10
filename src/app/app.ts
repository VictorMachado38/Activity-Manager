import { Component, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { SwUpdate } from '@angular/service-worker';

import { ActivitiesPage } from './features/activities/activities-page/activities-page';
import { CredentialsSection } from './features/credentials/credentials-section/credentials-section';
import { JiraDialog } from './shared/jira-dialog/jira-dialog';
import { LayoutSettingsService } from './core/services/layout-settings.service';
import { LayoutSettingsDialog } from './shared/layout-settings-dialog/layout-settings-dialog';
import { MessagesSection } from './features/messages/messages-section/messages-section';
import { ShortcutsPage } from './features/shortcuts/shortcuts-page/shortcuts-page';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  imports: [CredentialsSection, ShortcutsPage, MessagesSection, ActivitiesPage, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly dialog = inject(MatDialog);
  private readonly themeService = inject(ThemeService);
  private readonly swUpdate = inject(SwUpdate);
  readonly layout = inject(LayoutSettingsService);

  constructor() {
    // Sem isto o service worker segura o bundle antigo até TODAS as abas do app
    // serem fechadas — o que faz "buildei mas não mudou nada" acontecer toda
    // hora. Aqui, assim que uma versão nova termina de baixar, ativa e recarrega.
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates.subscribe((evt) => {
        if (evt.type === 'VERSION_READY') {
          void this.swUpdate.activateUpdate().then(() => document.location.reload());
        }
      });
      void this.swUpdate.checkForUpdate();
    }
  }

  openSettings(): void {
    this.dialog.open(LayoutSettingsDialog);
  }

  openJira(): void {
    this.dialog.open(JiraDialog, { width: '900px', maxWidth: '95vw' });
  }
}
