import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ShortcutLink, ShortcutLinkCreate, ShortcutLinkUpdate } from '../models/shortcut.model';

@Injectable({ providedIn: 'root' })
export class ShortcutService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/shortcuts';

  list(): Observable<ShortcutLink[]> {
    return this.http.get<ShortcutLink[]>(this.base);
  }

  create(data: ShortcutLinkCreate): Observable<ShortcutLink> {
    return this.http.post<ShortcutLink>(this.base, data);
  }

  update(id: string, data: ShortcutLinkUpdate): Observable<ShortcutLink> {
    return this.http.patch<ShortcutLink>(`${this.base}/${id}`, data);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
