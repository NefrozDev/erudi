import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Plic } from '../../shared/ui/plic/plic';

/** Holds the Explorer and Progress tabs until their phase. */
@Component({
  selector: 'app-coming-soon',
  imports: [Plic, TranslocoPipe],
  template: `
    <main class="page coming-soon">
      <app-plic mood="sleepy" />
      <h1 class="title">{{ 'comingSoon.title' | transloco }}</h1>
      <p class="subtitle">{{ 'comingSoon.text' | transloco }}</p>
    </main>
  `,
  styles: `
    .coming-soon {
      min-height: auto;
      align-items: center;
      padding-top: 64px;
      text-align: center;
      --plic-size: 160px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComingSoon {}
