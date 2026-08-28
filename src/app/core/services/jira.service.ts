import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { JiraMyItemsResponse } from '../models/jira-issue.model';

@Injectable({ providedIn: 'root' })
export class JiraService {
  private readonly http = inject(HttpClient);

  myItems(type?: string): Observable<JiraMyItemsResponse> {
    return this.http.get<JiraMyItemsResponse>('/api/jira/my-items', {
      params: type ? { type } : {},
    });
  }

  children(key: string): Observable<JiraMyItemsResponse> {
    return this.http.get<JiraMyItemsResponse>(
      `/api/jira/issue/${encodeURIComponent(key)}/children`,
    );
  }

  /** Estado atual (status/tipo/summary) das issues informadas. */
  syncIssues(keys: string[]): Observable<JiraMyItemsResponse> {
    return this.http.post<JiraMyItemsResponse>('/api/jira/sync', { keys });
  }
}
