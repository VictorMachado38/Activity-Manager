import { Component, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { ActivitiesPage } from './features/activities/activities-page/activities-page';
import { CredentialsSection } from './features/credentials/credentials-section/credentials-section';
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
  readonly layout = inject(LayoutSettingsService);

  openSettings(): void {
    this.dialog.open(LayoutSettingsDialog);
  }
}
