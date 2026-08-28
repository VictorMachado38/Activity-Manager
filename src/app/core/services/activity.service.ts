import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';

import { WorkActivity, WorkActivityCreate, WorkActivityUpdate } from '../models/activity.model';

@Injectable({ providedIn: 'root' })
export class ActivityService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/activities';

  // Incrementado quando atividades são criadas fora da própria página (ex.: importação
  // do Jira), para a ActivitiesPage saber que precisa recarregar a lista.
  readonly changed = signal(0);

  notifyChanged(): void {
    this.changed.update((value) => value + 1);
  }

  list(): Observable<WorkActivity[]> {
    return this.http.get<WorkActivity[]>(this.base);
  }

  create(data: WorkActivityCreate): Observable<WorkActivity> {
    return this.http.post<WorkActivity>(this.base, data);
  }

  update(id: string, data: WorkActivityUpdate): Observable<WorkActivity> {
    return this.http.patch<WorkActivity>(`${this.base}/${id}`, data);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  reorder(ids: string[]): Observable<WorkActivity[]> {
    return this.http.put<WorkActivity[]>(`${this.base}/reorder`, { ids });
  }
}
