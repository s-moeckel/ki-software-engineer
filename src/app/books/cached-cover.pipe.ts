import { Pipe, PipeTransform } from '@angular/core';
import { cachedCoverUrl } from './cached-cover-url';

@Pipe({ name: 'cachedCover' })
export class CachedCoverPipe implements PipeTransform {
  transform(source: string): string {
    return cachedCoverUrl(source);
  }
}
