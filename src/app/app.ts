import { Component } from '@angular/core';

import { ActivitiesPage } from './features/activities/activities-page/activities-page';
import { CredentialsSection } from './features/credentials/credentials-section/credentials-section';
import { ShortcutsPage } from './features/shortcuts/shortcuts-page/shortcuts-page';

@Component({
  selector: 'app-root',
  imports: [CredentialsSection, ShortcutsPage, ActivitiesPage],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
