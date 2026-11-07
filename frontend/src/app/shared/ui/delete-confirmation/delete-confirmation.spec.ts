import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buttonNamed, settle, textOf } from '../../../../testing/dom';
import { DeleteConfirmation } from './delete-confirmation';

describe('DeleteConfirmation', () => {
  let fixture: ComponentFixture<DeleteConfirmation>;
  let host: HTMLElement;
  let confirmed: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(DeleteConfirmation);
    fixture.componentRef.setInput('label', 'Supprimer la carte');
    fixture.componentRef.setInput('question', 'Supprimer cette carte ?');
    fixture.componentRef.setInput('confirmLabel', 'Supprimer définitivement');
    fixture.componentRef.setInput('keepLabel', 'Garder la carte');
    confirmed = vi.fn<() => void>();
    fixture.componentInstance.confirmed.subscribe(() => confirmed());
    host = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  async function click(name: string): Promise<void> {
    buttonNamed(host, name).click();
    await settle(fixture);
  }

  it('should only offer to delete at first', () => {
    expect(host.querySelectorAll('button')).toHaveLength(1);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('should ask first, and emit only once confirmed', async () => {
    await click('Supprimer la carte');
    expect(textOf(host, '[role="alert"]')).toBe('Supprimer cette carte ?');
    expect(confirmed).not.toHaveBeenCalled();

    await click('Supprimer définitivement');
    expect(confirmed).toHaveBeenCalledTimes(1);
  });

  it('should go back to the start when the learner keeps it', async () => {
    await click('Supprimer la carte');
    await click('Garder la carte');

    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(buttonNamed(host, 'Supprimer la carte')).toBeTruthy();
    expect(confirmed).not.toHaveBeenCalled();
  });

  it('should disable both choices while busy', async () => {
    await click('Supprimer la carte');
    fixture.componentRef.setInput('busy', true);
    await settle(fixture);

    expect(buttonNamed(host, 'Supprimer définitivement').disabled).toBe(true);
    expect(buttonNamed(host, 'Garder la carte').disabled).toBe(true);
  });
});
