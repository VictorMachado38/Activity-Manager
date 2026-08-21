import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AppCredential, AppCredentialCreate } from '../models/credential.model';

@Injectable({ providedIn: 'root' })
export class CredentialService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/credentials';

  list(): Observable<AppCredential[]> {
    return this.http.get<AppCredential[]>(this.base);
  }

  create(data: AppCredentialCreate): Observable<AppCredential> {
    return this.http.post<AppCredential>(this.base, data);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
