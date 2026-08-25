import { Component, inject } from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import {
  LayoutSettingsService,
  SECTIONS,
  SectionKey,
  SectionMeta,
} from '../../core/services/layout-settings.service';
import { THEME_OPTIONS, Theme, ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-layout-settings-dialog',
  imports: [DragDropModule, MatDialogModule, MatButtonModule, MatCheckboxModule, MatIconModule],
  templateUrl: './layout-settings-dialog.html',
  styleUrl: './layout-settings-dialog.scss',
})
export class LayoutSettingsDialog {
  private readonly ref = inject(MatDialogRef<LayoutSettingsDialog>);
  readonly layout = inject(LayoutSettingsService);
  readonly themeService = inject(ThemeService);
  readonly themeOptions = THEME_OPTIONS;

  readonly sectionsByKey = new Map<SectionKey, SectionMeta>(SECTIONS.map((s) => [s.key, s]));

  meta(key: SectionKey): SectionMeta {
    return this.sectionsByKey.get(key)!;
  }

  toggle(key: SectionKey, visible: boolean): void {
    this.layout.setHidden(key, !visible);
  }

  drop(event: CdkDragDrop<SectionKey[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const reordered = [...this.layout.order()];
    moveItemInArray(reordered, event.previousIndex, event.currentIndex);
    this.layout.setOrder(reordered);
  }

  selectTheme(theme: Theme): void {
    this.themeService.setTheme(theme);
  }

  close(): void {
    this.ref.close();
  }
}
