import { TestBed } from '@angular/core/testing';
import { AUDIO_CONTEXT_FACTORY, SoundEffects } from './sound-effects';

describe('SoundEffects', () => {
  // A minimal Web Audio stand-in recording the notes played.
  function fakeContext() {
    const started: number[] = [];
    const context = {
      currentTime: 10,
      destination: {},
      createOscillator: vi.fn(() => {
        const oscillator = {
          type: '',
          frequency: { value: 0 },
          connect: vi.fn((node: unknown) => node),
          start: vi.fn(() => started.push(oscillator.frequency.value)),
          stop: vi.fn(),
        };
        return oscillator;
      }),
      createGain: vi.fn(() => ({
        gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn((node: unknown) => node),
      })),
    };
    return { context, started };
  }

  let factory: ReturnType<typeof vi.fn<() => AudioContext | null>>;
  let fake: ReturnType<typeof fakeContext>;

  function setUp(): SoundEffects {
    fake = fakeContext();
    factory = vi.fn(() => fake.context as unknown as AudioContext);
    TestBed.configureTestingModule({
      providers: [{ provide: AUDIO_CONTEXT_FACTORY, useValue: factory }],
    });
    return TestBed.inject(SoundEffects);
  }

  beforeEach(() => localStorage.clear());

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('should be on by default and create no audio before the first sound', () => {
    const sounds = setUp();

    expect(sounds.enabled()).toBe(true);
    expect(factory).not.toHaveBeenCalled();
  });

  it('should play two rising notes for a known card and one low note otherwise', () => {
    const sounds = setUp();

    sounds.play('knew');
    sounds.play('again');

    expect(fake.started).toEqual([660, 880, 220]);
    // One audio context, reused.
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('should stay silent once turned off, and remember it on this device', () => {
    const sounds = setUp();

    sounds.setEnabled(false);
    sounds.play('knew');

    expect(sounds.enabled()).toBe(false);
    expect(factory).not.toHaveBeenCalled();
    expect(localStorage.getItem('erudi.sounds-off')).toBe('true');
  });

  it('should read the choice saved on this device, and forget it when turned back on', () => {
    localStorage.setItem('erudi.sounds-off', 'true');
    const sounds = setUp();
    expect(sounds.enabled()).toBe(false);

    sounds.setEnabled(true);

    expect(sounds.enabled()).toBe(true);
    expect(localStorage.getItem('erudi.sounds-off')).toBeNull();
  });

  it('should do nothing where Web Audio is missing', () => {
    const sounds = setUp();
    factory.mockReturnValue(null);

    expect(() => sounds.play('knew')).not.toThrow();
  });

  it('should keep going when the audio fails or storage is blocked', () => {
    const sounds = setUp();
    factory.mockImplementation(() => {
      throw new DOMException('Not allowed', 'NotAllowedError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });

    expect(() => sounds.play('knew')).not.toThrow();
    expect(() => sounds.setEnabled(false)).not.toThrow();
    expect(sounds.enabled()).toBe(false);
  });
});
