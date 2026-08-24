import { Component } from '@angular/core';

import { ActivitiesPage } from './features/activities/activities-page/activities-page';
import { CredentialsSection } from './features/credentials/credentials-section/credentials-section';
import { MessagesSection } from './features/messages/messages-section/messages-section';
import { ShortcutsPage } from './features/shortcuts/shortcuts-page/shortcuts-page';

@Component({
  selector: 'app-root',
  imports: [CredentialsSection, ShortcutsPage, MessagesSection, ActivitiesPage],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
