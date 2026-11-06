import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

export type ApiStatus = 'up' | 'down';

@Injectable({ providedIn: 'root' })
export class HealthApi {
  private readonly http = inject(HttpClient);

  // ASP.NET Core health checks answer in plain text, and with a 503 when unhealthy.
  getStatus(): Observable<ApiStatus> {
    return this.http.get('/api/health', { responseType: 'text' }).pipe(
      map((body): ApiStatus => (body === 'Healthy' ? 'up' : 'down')),
      catchError(() => of<ApiStatus>('down')),
    );
  }
}
