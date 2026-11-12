import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { BookRandomButtonComponent } from './books/book-random-button.component';
import { ThemePreference, ThemeService } from './shared/theme.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, BookRandomButtonComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly router = inject(Router);
  private readonly navigation = toSignal(this.router.events.pipe(filter(event => event instanceof NavigationEnd)));
  protected readonly theme = inject(ThemeService);
  private readonly nextTheme: Record<ThemePreference, ThemePreference> = {
    system: 'light',
    light: 'dark',
    dark: 'system'
  };
  private readonly themeNames = { system: 'System', light: 'Hell', dark: 'Dunkel' };
  protected readonly themeLabel = computed(
    () =>
      `Farbschema: ${this.themeNames[this.theme.preference()]}. Zu ${this.themeNames[this.nextTheme[this.theme.preference()]]} wechseln`
  );

  protected readonly universeActive = computed(() => {
    this.navigation();
    return this.router.isActive('/universe', {
      paths: 'exact',
      queryParams: 'ignored',
      matrixParams: 'ignored',
      fragment: 'ignored'
    });
  });

  protected readonly libraryActive = computed(() => {
    this.navigation();
    return this.router.isActive('/library', {
      paths: 'exact',
      queryParams: 'ignored',
      matrixParams: 'ignored',
      fragment: 'ignored'
    });
  });

  protected cycleTheme(): void {
    this.theme.choose(this.nextTheme[this.theme.preference()]);
  }
}
