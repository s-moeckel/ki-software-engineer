import { Pipe, PipeTransform } from '@angular/core';
import { cachedCoverUrl } from './cached-cover-url';

@Pipe({ name: 'cachedCover', standalone: true })
export class CachedCoverPipe implements PipeTransform {
  transform(source: string): string {
    return cachedCoverUrl(source);
  }
}
