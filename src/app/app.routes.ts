import { Routes } from '@angular/router';
import { BookListComponent } from './books/book-list.component';

export const routes: Routes = [
  {
    path: 'universe',
    loadComponent: () => import('./book-universe/book-universe.component').then(module => module.BookUniverseComponent)
  }
  {
    path: 'library',
    loadComponent: () => import('./library/library.component').then(module => module.LibraryComponent)
  },
  { path: '', component: BookListComponent },
  { path: '**', redirectTo: '' }
];
