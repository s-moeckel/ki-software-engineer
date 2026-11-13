import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { GOOGLE_BOOKS_API_KEY } from './books/google-books-api-client.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(),
    // Optional public browser key; restrict API access and HTTP referrers in Google Cloud.
    { provide: GOOGLE_BOOKS_API_KEY, useValue: '' },
    provideAnimations()
  ]
};
