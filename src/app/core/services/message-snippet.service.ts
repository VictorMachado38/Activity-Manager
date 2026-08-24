import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  MessageSnippet,
  MessageSnippetCreate,
  MessageSnippetUpdate,
} from '../models/message-snippet.model';

@Injectable({ providedIn: 'root' })
export class MessageSnippetService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/messages';

  list(): Observable<MessageSnippet[]> {
    return this.http.get<MessageSnippet[]>(this.base);
  }

  create(data: MessageSnippetCreate): Observable<MessageSnippet> {
    return this.http.post<MessageSnippet>(this.base, data);
  }

  update(id: string, data: MessageSnippetUpdate): Observable<MessageSnippet> {
    return this.http.patch<MessageSnippet>(`${this.base}/${id}`, data);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
