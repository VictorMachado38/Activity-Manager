import { Injectable, signal } from '@angular/core';

export type Theme = 'dark' | 'light' | 'gruvbox' | 'gruvbox-hard';

export interface ThemeOption {
  value: Theme;
  label: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { value: 'dark', label: 'Escuro' },
  { value: 'light', label: 'Claro' },
  { value: 'gruvbox', label: 'Gruvbox' },
  { value: 'gruvbox-hard', label: 'Gruvbox Hard' },
];

const STORAGE_KEY = 'activity-manager:theme';
const DEFAULT_THEME: Theme = 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.loadTheme());

  constructor() {
    this.applyTheme(this.theme());
  }

  setTheme(theme: Theme): void {
    this.theme.set(theme);
    this.applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* localStorage indisponível — preferência não será persistida */
    }
  }

  private applyTheme(theme: Theme): void {
    document.documentElement.setAttribute('data-theme', theme);
    const surface = getComputedStyle(document.documentElement)
      .getPropertyValue('--mat-sys-surface')
      .trim();
    if (surface) {
      this.setMetaThemeColor(surface);
    }
  }

  private setMetaThemeColor(color: string): void {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', color);
  }

  private loadTheme(): Theme {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (
        stored === 'dark' ||
        stored === 'light' ||
        stored === 'gruvbox' ||
        stored === 'gruvbox-hard'
      ) {
        return stored;
      }
    } catch {
      /* localStorage indisponível */
    }
    return DEFAULT_THEME;
  }
}
