import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { ApiStatus, HealthApi } from '../../core/api/health-api';
import { Home } from './home';

describe('Home', () => {
  let status$: Subject<ApiStatus>;
  let getStatus: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    status$ = new Subject<ApiStatus>();
    getStatus = vi.fn(() => status$.asObservable());

    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [{ provide: HealthApi, useValue: { getStatus } }],
    }).compileComponents();
  });

  async function render(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function statusText(host: HTMLElement): string | undefined {
    return host.querySelector('[role="status"]')?.textContent?.trim();
  }

  it('should show a pending status until the API answers, requesting it once', async () => {
    const host = await render();

    expect(host.querySelector('h1')?.textContent).toBe('Erudi');
    expect(statusText(host)).toBe('Checking the API…');
    expect(getStatus).toHaveBeenCalledTimes(1);
  });

  it('should show that the API is connected', async () => {
    const fixture = TestBed.createComponent(Home);
    status$.next('up');
    await fixture.whenStable();

    expect(statusText(fixture.nativeElement)).toBe('API connected');
  });

  it('should show that the API is unavailable', async () => {
    const fixture = TestBed.createComponent(Home);
    status$.next('down');
    await fixture.whenStable();

    expect(statusText(fixture.nativeElement)).toBe('API unavailable');
  });
});
