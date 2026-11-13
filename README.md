<h1 align="center">Modern Angular Workshop</h1>

<p align="center">
  <img alt="workshops-de-logo-blue" src="docs/logo-workshops-de.png" width="120">
  <br>
  <em>The best way to start embracing AI for your all-day development tasks</em>
  <br>
</p>

<p align="center">
  <a href="https://workshops.de/seminare-schulungen-kurse/angular-ai-agent-driven-development" target="_blank"><strong>workshops.de</strong></a>
  <br>
</p>

## Architecture

Ein Architekturreview mit Aufbau, Datenfluss, Risikobewertungen und priorisierten Empfehlungen findest du in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Angular conventions

The application uses Angular 21.2 and standalone components with OnPush
change detection throughout. Local UI state uses Signals, derived values use
computed Signals, and component bindings use signal inputs and function outputs.
Templates use native control flow; the search and book editor use typed Reactive
Forms. Services use inject(), scene hosts use signal queries, and all four
screens load through lazy routes. Three.js animation loops remain outside Angular;
scene disposal and request cancellation remain tied to component lifecycles.

The lockfile resolves Angular Framework and Compiler CLI to 21.2.26, CLI/Build/SSR to
21.2.30, and Material/CDK to 21.2.14. The application retains Zone.js and typed
Reactive Forms. Signal Forms are not part of this upgrade. Node.js 24.14.0,
TypeScript 5.9.2 and RxJS 7.8.0 satisfy the Angular 21 requirements.

The application regression suite uses Playwright with a mocked API. Chromium is
the only configured browser project. Run all product checks (excluding the external
Playwright example):

```sh
npx playwright test tests/book-create.spec.ts tests/book-details.spec.ts tests/book-pagination.spec.ts tests/book-search.spec.ts tests/book-random.spec.ts tests/book-cover-cache.spec.ts tests/theme.spec.ts tests/library.spec.ts tests/library-review.spec.ts tests/library-data.spec.ts tests/library-display.spec.ts tests/library-cover-cache.spec.ts tests/book-universe.spec.ts tests/universe-data.spec.ts tests/isbn.spec.ts tests/reading-list.spec.ts tests/header-navigation.spec.ts --workers=1
```

## Local Development

| Command       | Description                                      |
| ------------- | ------------------------------------------------ |
| `npm install` | Installs the packages to develop the Angular app |
| `npm start`   | Starts the Angular app                           |

## Color scheme

The header has an icon button that cycles through System → Hell → Dunkel → System.
Its monitor, sun, or moon icon shows the current mode; the tooltip names the current
and next mode. System is the default and follows live
changes to the device color scheme. The choice is stored locally under
`bookmonkey-theme`; if browser storage is blocked, it still works for the session.
The theme also applies to Material dialogs and toast messages.

Run `npx playwright test tests/theme.spec.ts` to check theme selection, persistence,
system changes, keyboard access, blocked storage, and mobile surfaces in both themes.

## The API

### MCP-Zugriff auf die Buchbibliothek

Der lokale `bookmonkey_mcp` bietet `list_books`, `search_books` und `get_book`
über dieselbe Buch-API wie die Oberfläche. Vorbereitung: `npm run build.book-mcp`,
Backend mit `npm run backend` starten und den MCP-Client verbinden.
Die Codex-Projektkonfiguration ist enthalten. Einrichtung, Parameter und Tests
stehen in [tools/book-mcp/README.md](tools/book-mcp/README.md).

### Eigenes SQLite-Backend

Zum gemeinsamen Debuggen in VS Code **Backend + Frontend** auswählen und F5 drücken.
Setup und Hinweise zu TypeScript-Breakpoints stehen in der
[Debug-Anleitung](backend/README.md#backend-und-frontend-gemeinsam-debuggen).

Das Backend speichert seine Bücher in der Datei backend/storage/bookmonkey.sqlite.
Node.js ab Version 24 genügt; eine separate Datenbankinstallation ist nicht erforderlich.
Vom Repository-Root starten:

```sh
npm ci --prefix backend
npm run backend
```

Die API läuft unter http://localhost:4730; das Frontend startet weiterhin mit
npm start. Eine laufende bookmonkey-api vorher beenden. Das Frontend benötigt
keine Anpassung. Beim ersten Start werden 1000 echte Science-Fiction-Titel eingespielt;
weitere Starts erhalten vorhandene Bearbeitungen.

Cover werden beim ersten Abruf in derselben SQLite-Datei zwischengespeichert und
anschließend lokal ausgeliefert, auch nach Neustarts. Siehe [Cover-Cache](backend/README.md#cover-cache).

Die [Backend-Anleitung](backend/README.md) beschreibt Start, Sicherung der Datei,
Konfiguration, API-Vertrag und optionalen Dockerbetrieb. Siehe auch
[Startbestand erweitern](backend/data/README.md) und
[abgestimmte Anforderung](docs/requirements/science-fiction-backend.md).

```sh
npm test --prefix backend
```

### Virtual Library

Open `/library` through the Virtual Library header action. Hold the right mouse
button over the 3D scene to walk forward; drag to steer. Releasing the button
stops walking, including when released outside the scene. Left-click selects a
book and takes it out when within two metres and unobstructed. The optional mouse
lock enables looking around without holding a button.
W/A/S/D and Shift remain available for movement and faster walking.

While inspecting a book, walking pauses and the mouse wheel zooms the book
(up to enlarge, down to reduce). The labelled HTML controls offer the same actions.
Click elsewhere in the 3D scene to return the book to its shelf. Clicking the held
book, dragging to rotate it and using its HTML controls keep it in hand.
Escape first returns a held book, otherwise exits mouse lock; it also stops
movement. Losing window focus or mouse lock stops movement as well.

Search leaves shelf positions unchanged: matching books retain their covers and
receive a warm highlight; other books appear grey. Clearing search restores the
normal appearance. A book being inspected stays in full colour until returned.

Run `npx playwright test tests/library.spec.ts tests/library-data.spec.ts --project=chromium --workers=1`
to check layout, mobile actions, mouse movement, stopping and book zoom.

### BookMonkey Universe

The Universe link in the header opens `/universe`, a lazy-loaded Three.js galaxy of
the full collection from the existing `getAllBooks()` endpoint. Start the frontend
with `npm start` and the SQLite backend with `npm run backend`. No extra
server, API key, example books, or graphics assets are needed.

The header links directly to Leseliste (`/reading-list`), Library (`/library`),
Universe (`/universe`) and Listenansicht (`/`), followed by the dice action and theme selection. BookMonkey
links to `/`. The current view is highlighted and marked with `aria-current="page"`.
Links wrap on narrow screens and remain visible and keyboard-accessible.
Run `npx playwright test tests/header-navigation.spec.ts --project=chromium --workers=1`
to check direct entry, navigation between all views, Home, history, global actions
and the header at desktop and 320px widths in both themes.

`src/app/book-universe/` contains the standalone Angular screen (local Signals,
search, panels and Discovery controls), `universe-data.ts` (pure classification,
layout, relationships, search and camera calculations), and `universe-renderer.ts`
(GPU resources, OrbitControls, picking, labels and camera flights). Book models,
list behavior and API endpoints remain unchanged. The existing `BookDialogService`
opens fresh details by ISBN; confirmed and unconfirmed editor saves reload Universe.

The current model has no categories, tags, rating or publication year. Topics are
explicitly marked as inferred: normalized title, subtitle and description are
checked in priority order for Angular, Security, databases, architecture,
performance, JavaScript/TypeScript and web-development keywords; unmatched books
go into “Weitere Themen”. The exact dictionaries live in `universe-data.ts`.
Sorting by ISBN, a stable ISBN hash and a golden-angle spiral make positions
reproducible independently of API order. Cluster spacing adapts to collection size.
Planet radii use the square root of page count, clamped to 0.8–1.8; missing or
nonpositive counts use radius 1. Invalid records and duplicate ISBNs are counted
and skipped visibly.

Relationships score an identical normalized author string at 6, a shared inferred
topic at 2 (excluding the fallback topic), and shared nontrivial words at up to 3.
The strongest candidates with score ≥3 are retained, capped at three edges per
book; six candidates per source bound intermediate storage. Reasons appear beside
related books. This is a deterministic heuristic, not a claim about actual book
categories or semantic similarity. Pair comparison is quadratic with bounded
keyword sets; layout tests cover 50, 200, 500 and 1,000 books.

Drag to orbit, scroll/pinch to zoom, right-drag to pan, click to select and
double-click to fly to a book. Search supports accents, multiple words, arrow keys,
Enter and Escape. The HTML book list also makes every book selectable without
canvas interaction. Discovery visits clusters and ISBN-sorted books with start,
pause, resume, previous, next and stop controls; manual camera input and hidden
tabs pause it. Reduced motion disables rotation, floating and extended flights.

During camera flights, a procedural Enterprise points along the camera's flight path
with classic proportions: a circular panelled saucer, a cylindrical engineering
hull, raised twin nacelles with red collectors, a copper deflector and a gentle bank.
The existing `NC-1701 D` inscription is retained on the saucer and both nacelles.
It fades out on arrival and disappears on cancellation, Discovery pause/stop or
navigation. Reduced motion skips the ship animation. The model uses shared Three.js
geometry and materials, requires no external assets and is disposed with the scene.

Planets and halos use shared instanced geometry, links are batched, labels are
bounded and culled, and device pixel ratio is capped. ResizeObserver refits on
aspect changes. The renderer owns and releases listeners, controls, labels,
observers, animation loops, geometry, materials and WebGL resources. Missing WebGL,
initialization failure and context loss show an operable searchable HTML fallback.
On phones details appear as a bottom sheet. Frame rate remains device-dependent;
the 1,000-book logic tests are not a GPU benchmark.

```sh
npm run build
npx playwright test tests/universe-data.spec.ts tests/book-universe.spec.ts --workers=1
```

Tests use the existing Playwright runner, including browser-independent logic
tests, actual WebGL picking and flight, keyboard search, details/edit refresh,
mobile fallback, context loss and repeated route cleanup. Chromium tests explicitly
enable SwiftShader for headless machines. See the upstream
[InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) and
[OrbitControls](https://threejs.org/docs/pages/OrbitControls.html) documentation.

### Random reading idea

The dice button in the header opens a dialog with a two-second 3D dice animation
with changing book cover previews on all six faces instead of dice pips. It selects from the entire collection independently
of the current search. Every book has the same chance; consecutive rolls may pick
the same book. The result offers another roll or the existing book details editor.
Saving there refreshes the list with its current search.

The dialog supports keyboard focus, both themes, reduced motion, missing/broken
covers (including the dice faces), empty collections, and retry after a load failure.
Reduced motion keeps both the dice and its cover previews still. Closing cancels pending
requests and animation timers. Collection requests time out after 15 seconds.

`GET /books` without `q` or `_limit` supplies the full selection pool. The local backend
starts with 1000 distinct titles and ISBNs; `GET /books?_limit=10` returns ten books.

Run `npx playwright test tests/book-random.spec.ts` for the mocked dice flow.

### Leseliste

Der Header-Link **Leseliste** öffnet `/reading-list`. Das Board beginnt leer mit
den Spalten „möchte ich lesen“, „lese ich gerade“ und „gelesen“. **Zur Leseliste
hinzufügen** an einer Buchkarte oder im Detaildialog nimmt ein Buch am Ende der
ersten Spalte auf. Wiederholtes Hinzufügen erzeugt kein Duplikat und erhält den
bisherigen Status und die Reihenfolge.

Karten lassen sich am Griff per Drag-and-Drop verschieben und umsortieren.
Alternativ stehen die beschriftete Lesestatus-Auswahl sowie **Nach oben** und
**Nach unten** für Tastaturbedienung bereit. Auf schmalen Bildschirmen stehen die
Spalten untereinander. **Aus Leseliste entfernen** entfernt nur die Zuordnung,
das Buch bleibt im Bestand. **Details** öffnet den vorhandenen Buchdialog.

Das eigene Backend speichert Zugehörigkeit, Status und Reihenfolge in derselben
SQLite-Datei wie die Bücher. Neuladen und Backendneustarts erhalten das Board;
Benutzerkonten und zusätzliche Dienste sind nicht erforderlich. Die alternative
`bookmonkey-api` bietet diese Erweiterung nicht.

Während des Speicherns sind weitere Boardaktionen gesperrt. Bestätigte Fehler
nehmen die sichtbare Änderung zurück und bieten **Erneut versuchen**. Nach einem
Timeout (15 Sekunden) oder Verbindungsabbruch wird der Serverstand abgeglichen,
weil die Änderung bereits gespeichert sein könnte. Schlägt auch der Abgleich
fehl, muss **Erneut laden** erfolgreich sein, bevor weitere Änderungen möglich
sind. Ladefehler erscheinen sichtbar mit Wiederholungsmöglichkeit.

```sh
npx playwright test tests/reading-list.spec.ts tests/header-navigation.spec.ts --project=chromium --workers=1
npm test --prefix backend
```

### Frisch erschienen

Oberhalb der Sammlung zeigt **Frisch erschienen** alle Bücher aus dem eigenen
Bestand, deren Erscheinungsdatum auf heute oder einen der vorherigen 89 Kalendertage
fällt. Maßgeblich ist `Europe/Berlin`; neueste Ausgaben stehen zuerst, bei gleichem
Datum entscheidet die ISBN. Suche und Seitennavigation der Sammlung beeinflussen
die Auswahl nicht. Die Buchreihe lässt sich per Touch, Pfeilschaltflächen oder
mit Pfeiltasten sowie Home/End auf der fokussierten Reihe durchblättern.
Details und Hinzufügen zur Leseliste funktionieren wie in der Sammlung.

Das optionale Feld **Erscheinungsdatum** beim Anlegen und Bearbeiten bezieht sich
auf die konkrete ISBN-Ausgabe. Ohne Datum oder mit zukünftigem Datum erscheint
ein Buch nicht in der Sektion. Bestehende Bücher bekommen kein Datum automatisch;
anfangs kann daher der Leerzustand erscheinen. Das eigene Backend stellt
`GET /books/new-releases` bereit; die alternative `bookmonkey-api` unterstützt
diese Erweiterung nicht. Ladefehler bieten eine eigene Wiederholungsaktion.

Prüfung: `npx playwright test tests/book-new-releases.spec.ts --project=chromium`
und `npm test --prefix backend`.

### Creating books

The **Buch anlegen** button above the collection opens an empty, keyboard-accessible
dialog. ISBN, title, author and a positive whole page count are required; subtitle,
publisher, price, cover URL and a multiline description are optional. ISBN is
checked for presence and uniqueness, without an additional checksum rule. Missing
or broken covers use the existing placeholder. Cover uploads and ISBN imports
are outside this form.

The local backend accepts `POST /books`, assigns identity and persists the book in
SQLite. Successful creation closes the dialog, shows a toast and reloads the list
with the current search. A new book appears only if it matches that search and
falls within the current ten-result limit. Errors preserve the draft; an existing
ISBN is reported explicitly. Saving blocks further submission and closing for up
to 15 seconds. After a timeout or lost connection, the draft stays locked and can
be retried with the same ISBN; the database prevents duplicates. Closing after an
unconfirmed save refreshes the collection without a success toast.

Run `npx playwright test tests/book-create.spec.ts --project=chromium --workers=1`
and `npm test --prefix backend` to check creation, validation, conflicts, persistence,
errors, retries, keyboard focus and mobile forms in both themes.

### Details and editing

Book details use `GET /books/:isbn`; editing sends the full book to `PUT /books/:isbn`,
including its unchanged `id`, `userId`, and ISBN. `price` remains a string.
See the [backend API contract](backend/README.md#api-vertrag).

### ISBN validation

`isValidIsbn(value)` in `src/app/books/isbn.ts` checks ISBN-10 and ISBN-13 format
and checksums. It accepts whitespace, hyphens, and a final `X` or `x` for ISBN-10;
ISBN-13 requires a `978` or `979` prefix. Empty strings, other characters, wrong
lengths, and incorrect check digits return `false`. It does not verify registration,
separator placement, or whether a book exists. The function is independent of the
editor, where the ISBN remains read-only and is preserved as the API key.

Run `npx playwright test tests/isbn.spec.ts --project=chromium` for the function
tests using the existing Playwright runner; these tests do not launch a browser.

### Book details checks

```sh
npm run build
npx playwright install
npx playwright test tests/book-details.spec.ts tests/book-search.spec.ts
```

The Playwright suite starts Angular and mocks API responses; no running API is needed.
It covers keyboard access, details, draft cancellation, validation, saving and search
refresh, load/save failures, and a mobile viewport with a broken cover.
Search checks cover debouncing, stale responses, clearing, empty results, and retry.
The list loads ten books per page from the local backend, with previous/next buttons
and page and total counts. Search and clear restart on page one; dialog refreshes
preserve the search and page, falling back to the last valid page when results shrink.
Run `npx playwright test tests/book-pagination.spec.ts` for pagination checks.
Pagination requires `_page` support and a CORS-exposed `X-Total-Count` header from
the backend. Legacy APIs without that header display only the first limited results.
Detail requests time out after 15 seconds. An unconfirmed save keeps the draft visible
and allows closing; reload the saved version before editing again. Reloading discards
the draft. Closing after an unconfirmed save refreshes the list without claiming success.

The local backend has integration tests against SQLite for GET/PUT by ISBN,
complete book responses, preserved identity, string prices, HTTP 404, CORS and
repeatable initialization. Run them with the backend test command above.

The former `npx bookmonkey-api` remains an optional alternative at the same address;
its data is separate from the SQLite file. Run only one backend on port 4730.

## VS Code

If you are using [VS Code](https://code.visualstudio.com/) as you editor of choice, you might see a popup after opening this repository.
We added a few plugin recommendations to simplify writing code during the workshop:

1. Angular Language Service - Adds better syntax-highlighting & automatic refactorings
1. Prettier - Formats your code automatically in the same way across your project.
