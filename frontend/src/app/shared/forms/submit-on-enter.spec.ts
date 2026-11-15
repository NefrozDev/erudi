import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { SubmitOnEnter } from './submit-on-enter';

@Component({
  imports: [SubmitOnEnter],
  template: `<form (submit)="sent($event)"><textarea appSubmitOnEnter></textarea></form>`,
})
class Host {
  readonly sent = vi.fn((event: Event) => event.preventDefault());
}

function setUp() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const textarea = (fixture.nativeElement as HTMLElement).querySelector('textarea')!;
  return { host: fixture.componentInstance, textarea };
}

function press(textarea: HTMLTextAreaElement, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true,
    ...init,
  });
  textarea.dispatchEvent(event);
  return event;
}

describe('SubmitOnEnter', () => {
  it('sends the form once on Enter and keeps the line break out', () => {
    const { host, textarea } = setUp();

    const event = press(textarea, {});

    expect(host.sent).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('keeps Shift+Enter as a new line', () => {
    const { host, textarea } = setUp();

    const event = press(textarea, { shiftKey: true });

    expect(host.sent).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves Enter to an input method composing text', () => {
    const { host, textarea } = setUp();

    const event = press(textarea, { isComposing: true });

    expect(host.sent).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
