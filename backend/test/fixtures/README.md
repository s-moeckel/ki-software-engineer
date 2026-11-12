`isbn-missing.jpg` is ISBN.de's fixed "Kein Bild gefunden" response, retrieved
from `https://buch.isbn.de/cover/9780000000019.jpg` on 12 November 2026.
It is a regression fixture for recognizing HTTP-200 placeholder images.

`bic-missing.jpg` is BIC Media's white placeholder, retrieved from
`https://www.bic-media.com/dmrs/cover.do?isbn=9783963570711&width=600`
on the same date. It must fall through to another provider.
