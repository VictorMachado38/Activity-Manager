import { Injectable, computed, signal } from '@angular/core';

export type SectionKey = 'credentials' | 'shortcuts' | 'messages' | 'activities';

export interface SectionMeta {
  key: SectionKey;
  label: string;
}

export const SECTIONS: SectionMeta[] = [
  { key: 'credentials', label: 'Credenciais' },
  { key: 'shortcuts', label: 'Atalhos' },
  { key: 'messages', label: 'Mensagens' },
  { key: 'activities', label: 'Atividades' },
];

const STORAGE_KEY = 'activity-manager:layout';

interface StoredLayout {
  order: SectionKey[];
  hidden: SectionKey[];
}

@Injectable({ providedIn: 'root' })
export class LayoutSettingsService {
  private readonly defaultOrder: SectionKey[] = SECTIONS.map((section) => section.key);

  readonly order = signal<SectionKey[]>(this.loadOrder());
  readonly hidden = signal<Set<SectionKey>>(this.loadHidden());

  readonly visibleOrder = computed(() =>
    this.order().filter((key) => !this.hidden().has(key)),
  );

  setOrder(order: SectionKey[]): void {
    this.order.set(order);
    this.persist();
  }

  setHidden(key: SectionKey, isHidden: boolean): void {
    this.hidden.update((current) => {
      const next = new Set(current);
      if (isHidden) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
    this.persist();
  }

  isVisible(key: SectionKey): boolean {
    return !this.hidden().has(key);
  }

  private loadOrder(): SectionKey[] {
    const stored = this.read();
    const fromStorage = stored?.order.filter((key) => this.defaultOrder.includes(key)) ?? [];
    const missing = this.defaultOrder.filter((key) => !fromStorage.includes(key));
    return [...fromStorage, ...missing];
  }

  private loadHidden(): Set<SectionKey> {
    const stored = this.read();
    return new Set(stored?.hidden.filter((key) => this.defaultOrder.includes(key)) ?? []);
  }

  private read(): StoredLayout | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as StoredLayout) : null;
    } catch {
      return null;
    }
  }

  private persist(): void {
    const value: StoredLayout = { order: this.order(), hidden: [...this.hidden()] };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      /* localStorage indisponível — preferência não será persistida */
    }
  }
}
