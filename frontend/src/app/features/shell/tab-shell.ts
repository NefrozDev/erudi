import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

interface Tab {
  path: string;
  label: string;
  exact: boolean;
}

const TABS: readonly Tab[] = [
  { path: '/', label: 'shell.home', exact: true },
  { path: '/explore', label: 'shell.explore', exact: false },
  { path: '/progress', label: 'shell.progress', exact: false },
  { path: '/settings', label: 'shell.settings', exact: false },
];

/** The signed-in layout: the current tab above the bottom bar of screen 7. */
@Component({
  selector: 'app-tab-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslocoPipe],
  templateUrl: './tab-shell.html',
  styleUrl: './tab-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabShell {
  protected readonly tabs = TABS;
}
