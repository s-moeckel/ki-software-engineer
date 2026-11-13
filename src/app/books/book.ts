export interface Book {
  id: string;
  isbn: string;
  title: string;
  subtitle?: string;
  author: string;
  publisher: string;
  numPages: number;
  price: string;
  cover: string;
  abstract: string;
  userId: number;
  publicationDate?: string;
}

export type NewBook = Omit<Book, 'id' | 'userId'>;
