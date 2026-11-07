import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { timeZoneInterceptor } from './time-zone.interceptor';

describe('timeZoneInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([timeZoneInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    controller.verify();
    vi.restoreAllMocks();
  });

  function deviceTimeZoneIs(timeZone: string | undefined): void {
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone }) as Intl.ResolvedDateTimeFormatOptions,
    } as Intl.DateTimeFormat);
  }

  function headerSentTo(url: string): string | null {
    http.get(url).subscribe();
    const request = controller.expectOne(url);
    request.flush({});
    return request.request.headers.get('X-Time-Zone');
  }

  it("should send the device's time zone to the API", () => {
    deviceTimeZoneIs('Europe/Brussels');

    expect(headerSentTo('/api/decks')).toBe('Europe/Brussels');
  });

  it.each(['https://fonts.googleapis.com/css2', '/i18n/fr.json', '/apiary'])(
    'should keep it from %s',
    (url) => {
      deviceTimeZoneIs('Europe/Brussels');

      expect(headerSentTo(url)).toBeNull();
    },
  );

  it('should send nothing when the device does not tell its time zone', () => {
    deviceTimeZoneIs(undefined);

    expect(headerSentTo('/api/decks')).toBeNull();
  });

  it('should send nothing when the browser cannot format dates', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new RangeError('Unsupported');
    });

    expect(headerSentTo('/api/decks')).toBeNull();
  });
});
