import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiStatus, HealthApi } from './health-api';

describe('HealthApi', () => {
  let api: HealthApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(HealthApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function requestStatus(): ApiStatus[] {
    const statuses: ApiStatus[] = [];
    api.getStatus().subscribe((status) => statuses.push(status));
    return statuses;
  }

  it('should report up when the API answers Healthy', () => {
    const statuses = requestStatus();

    const request = http.expectOne('/api/health');
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('text');
    request.flush('Healthy');

    expect(statuses).toEqual(['up']);
  });

  it('should report down when the API answers Degraded', () => {
    const statuses = requestStatus();

    http.expectOne('/api/health').flush('Degraded');

    expect(statuses).toEqual(['down']);
  });

  it('should report down instead of erroring when the API is unhealthy', () => {
    const statuses = requestStatus();

    http
      .expectOne('/api/health')
      .flush('Unhealthy', { status: 503, statusText: 'Service Unavailable' });

    expect(statuses).toEqual(['down']);
  });

  it('should report down when the API is unreachable', () => {
    const statuses = requestStatus();

    http.expectOne('/api/health').error(new ProgressEvent('error'));

    expect(statuses).toEqual(['down']);
  });
});
