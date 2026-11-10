import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  inject,
  Injector,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

const HEADING_WAIT_MS = 3000;

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopWaiting?.());
    // A new screen takes focus to its heading, so a screen reader announces it and the next
    // Tab starts from the top of it. Not on the first screen (the browser handles page loads),
    // nor when only the query string changes: the Explorer's search writes there as one types.
    let path: string | null = null;
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        const next = event.urlAfterRedirects.split(/[?#]/)[0];
        const moved = path !== null && next !== path;
        path = next;
        if (moved) {
          afterNextRender(() => this.focusHeading(), { injector: this.injector });
        }
      });
  }

  private stopWaiting?: () => void;

  /** Many screens show their heading once their data came: waits for it, a few seconds at most. */
  private focusHeading(): void {
    this.stopWaiting?.();
    if (this.tryFocusHeading()) {
      return;
    }
    const observer = new MutationObserver(() => {
      if (this.tryFocusHeading()) {
        this.stopWaiting?.();
      }
    });
    const timeout = setTimeout(() => this.stopWaiting?.(), HEADING_WAIT_MS);
    observer.observe(this.document.body, { childList: true, subtree: true });
    this.stopWaiting = () => {
      observer.disconnect();
      clearTimeout(timeout);
      this.stopWaiting = undefined;
    };
  }

  /** True once the wait is over: the heading took focus, or the user already moved it. */
  private tryFocusHeading(): boolean {
    const active = this.document.activeElement;
    if (active && active !== this.document.body) {
      return true;
    }
    const heading = this.document.querySelector<HTMLElement>('h1');
    if (!heading) {
      return false;
    }
    if (!heading.hasAttribute('tabindex')) {
      heading.tabIndex = -1;
    }
    heading.focus({ preventScroll: true });
    return true;
  }
}
