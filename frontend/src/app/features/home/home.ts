import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth-store';
import { Plic } from '../../shared/ui/plic/plic';

/** Screen 7. Decks, the daily goal and the sessions come with the next phases. */
@Component({
  selector: 'app-home',
  imports: [Plic, TranslocoPipe],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  private readonly auth = inject(AuthStore);

  protected readonly username = computed(() => this.auth.user()?.username ?? '');
}
