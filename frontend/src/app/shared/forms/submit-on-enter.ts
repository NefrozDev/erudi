import { Directive } from '@angular/core';

/**
 * Enter in a textarea sends its form, Shift+Enter still adds a line. Ignored while an input
 * method composes text (Enter then picks a word).
 */
@Directive({
  selector: 'textarea[appSubmitOnEnter]',
  host: { '(keydown.enter)': 'submit($event)' },
})
export class SubmitOnEnter {
  protected submit(event: Event): void {
    const keyboard = event as KeyboardEvent;
    if (keyboard.shiftKey || keyboard.isComposing) {
      return;
    }

    keyboard.preventDefault();
    (keyboard.target as HTMLTextAreaElement).form?.requestSubmit();
  }
}
