import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'reading-list',
    loadComponent: () => import('./reading-list/reading-list.component').then(module => module.ReadingListComponent)
  },
  {
    path: 'universe',
    loadComponent: () => import('./book-universe/book-universe.component').then(module => module.BookUniverseComponent)
  },
  {
    path: 'library',
    loadComponent: () => import('./library/library.component').then(module => module.LibraryComponent)
  },
  { path: '', loadComponent: () => import('./books/book-list.component').then(module => module.BookListComponent) },
  { path: '**', redirectTo: '' }
];
