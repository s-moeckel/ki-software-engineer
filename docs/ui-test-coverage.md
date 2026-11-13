# Frontend-Testabdeckung

Die Matrix beschreibt Nutzerverhalten, keine gemessene Zeilen- oder Branch-Abdeckung.
Alle vier gerouteten Ansichten und ihre eingebundenen Dialoge werden über Playwright geprüft.
Angular läuft tatsächlich im Browser; Bücher-API, Leseliste und Cover-Endpunkte werden gemockt.
Das ist kein Nachweis für die Implementierung oder Persistenz des Backends.

## Ausführung

```sh
npm run test:ui
npx playwright show-report
```

Der Produktlauf verwendet Chromium und einen Worker, startet Angular selbst und schließt
`tests/example.spec.ts` aus. Die Browser-Specs verwenden `tests/support/ui-test.ts`: Nicht gemockte
Backend-Aufrufe werden vor dem Netzwerkzugriff abgebrochen und führen zu einer fehlgeschlagenen
Assertion. Externe Dienste werden ebenfalls blockiert. Die standardmäßig leere Neuerscheinungsliste
kann durch einen Page-Mock überschrieben werden. Jeder Test erhält einen eigenen Browserkontext.
Google-Font-Stylesheets werden lokal mit leerem CSS gemockt; der Browser verwendet seine Schrift-Fallbacks.

Der HTML-Bericht enthält Testnamen und bei neuen Szenarien Given/When/Then-Schritte.
Bei belegtem Berichtsport: `npx playwright show-report --port 9324`.
Unter Windows PowerShell bei gesperrten Skripten `npm.cmd` und `npx.cmd` verwenden.

## Seiten und Komponenten

Alle folgenden Specs liegen unter `tests/`.

| Oberfläche / Komponenten                            | Verhalten                                                                                                                                                                                                                                                           | Specs                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| App-Rahmen, Header und Routing                      | Direkteinstieg in alle vier Routen, Navigation, aktive Links, Home, Browserhistorie, Tastatur, globale Aktionen und 320px-Layout; unbekannte Route führt zur Sammlung                                                                                               | `header-navigation.spec.ts`, `app-journey.spec.ts`                                    |
| Buchliste `/`, Buchkarten                           | Initiale Liste, Titelsuche, Clear, getrennte Leer-/Fehlerzustände, Retry, 300-ms-Debouncing, verspätete Antworten und Cleanup                                                                                                                                       | `book-search.spec.ts`                                                                 |
| Listen-Seitennavigation                             | Seitengröße und Trefferzahl, erste/letzte Seite, Suche ab Seite 1, Retry auf aktueller Seite, Aktualisierung nach Speichern und kleiner gewordener Trefferzahl, Request-Abbruch, Tastatur/mobil                                                                     | `book-pagination.spec.ts`                                                             |
| Buchdetails und Bearbeitungsdialog                  | Aktuelle Daten per ISBN, Fokus, Abbrechen ohne Mutation, Validierung, vollständiger PUT, Doppelspeicherschutz, Schließsperre, Fehler/Retry und unbestätigtes Speichern; mobile Darstellung                                                                          | `book-details.spec.ts`                                                                |
| Anlegedialog                                        | Leerer Entwurf, Fokus, Pflichtwerte, Ganzzahlgrenzen, optionale Felder, POST/Refresh, Konflikt, Fehler, unbestätigtes Speichern und mobile Darstellung                                                                                                              | `book-create.spec.ts`                                                                 |
| Erscheinungsdatum und Neuerscheinungen              | Anzeige/Leeren/Übertragung des Datums, unvollständige native Datumseingabe beim Anlegen und Bearbeiten; unabhängige Zeile, Details, Refresh, Retry, mobile Tastatur, Ladeanzeige, Timeout, Abbruch und Leselistenaktion                                             | `book-new-releases.spec.ts`                                                           |
| Zufallsbutton und Würfeldialog                      | Auswahl aus ganzer Sammlung, Animation, wiederholte Auswahl, Details/Refresh/Fokus, Ladefehler/Leerzustand, Cover-Fallback, Schließen/Abbruch und reduzierte Bewegung                                                                                               | `book-random.spec.ts`                                                                 |
| Library `/library`                                  | Echte 3D-Szene, Größenanpassung, Suchmarkierung, Buchauswahl/-betrachtung, Drehen/Zoom, Zurücklegen, Reichweite/Kollisionen, Reset und gesperrte Aktionen während Betrachtung                                                                                       | `library.spec.ts`, `library-display.spec.ts`, `library-review.spec.ts`                |
| Library: Zustände und Steuerung                     | Leerer Bestand mit Rückweg; fehlendes WebGL beim Einstieg, erfolglose Suche/Clear und frische Details bei 1280/320px; Grafikqualität über Canvasauflösung, Pointer Lock/Escape und Abbruch beim Verlassen                                                           | `library-states.spec.ts`                                                              |
| Library: Wiederherstellung                          | Timeout/Retry, Grafik-Kontextverlust mit nutzbaren HTML-Details, fehlgeschlagener Refresh nach Bearbeiten, Szene und Ressourcen freigeben                                                                                                                           | `library-review.spec.ts`                                                              |
| Universe `/universe`                                | Vollständige Sammlung, Suche/Cluster, Clear/Buchliste, Details/Bearbeitung/Refresh, verwandte Bücher, Discovery, Hover/Raycasting, Labels/Verbindungen, Flüge und reduzierte Bewegung                                                                               | `book-universe.spec.ts`                                                               |
| Universe: Zustände und Tastatur                     | Laden/15-s-Timeout/Retry, Request-Abbruch, mehrere Treffer mit ArrowUp/ArrowDown/Enter/Escape inklusive ARIA-Zuständen bei 1280/320px, Hinweis auf verworfene Datensätze, WebGL erneut initialisieren                                                               | `universe-states.spec.ts`                                                             |
| Universe: Fallback und Cleanup                      | API-Fehler/Leerzustand, mobiles HTML-Fallback, wiederholte Navigation, Schleifen aufräumen und Grafik-Kontextverlust                                                                                                                                                | `book-universe.spec.ts`                                                               |
| Leseliste `/reading-list` und Hinzufügen-Komponente | Leeres Board, Hinzufügen aus Liste/Details/Neuerscheinungen, Duplikate, Statuswechsel, Drag-and-drop, Reihenfolge, Entfernen, Reload, Details/Fokus, Fehler/Rollback, Abgleich unbestätigter Schreibvorgänge, Schreibsperre, Timeout, Abbruch und 320px hell/dunkel | `reading-list.spec.ts`, `book-new-releases.spec.ts`                                   |
| Farbschema und Toasts                               | System/hell/dunkel, Persistenz, Gerätewechsel, gesperrter Speicher, Tastatur und mobile Zustände/Dialoge/Toasts; Erfolgsmeldungen bei Schreiben                                                                                                                     | `theme.spec.ts`, `book-create.spec.ts`, `book-details.spec.ts`, `app-journey.spec.ts` |
| Cover-Darstellung und Cache-Pipe                    | Cache-URLs und Fehler-Fallback in Karte/Details; geladene Texturen in Library und Universe                                                                                                                                                                          | `book-cover-cache.spec.ts`, `library-cover-cache.spec.ts`, `book-universe.spec.ts`    |
| Zusammenhängender Nutzerablauf                      | Anlegen → Bearbeiten → Suchen → Leseliste hinzufügen → Status ändern → Reload → gespeicherte Details in Library und Universe; gemeinsame Mockdaten und genau die erwarteten Schreibvorgänge                                                                         | `app-journey.spec.ts`                                                                 |

### Parallel ergänzte Google-Books-Informationen

`book-google-information.spec.ts` prüft passende ISBN-Daten, unabhängige Originaldaten und
Schreibverträge, Lade-/Leer-/Fehlerzustände, Retry, Timeout und Abbruch sowie Textdarstellung,
sichere Quellenlinks und mobile Tastaturbedienung. Die externe API ist ausdrücklich gemockt.
`google-books-data.spec.ts` ergänzt reine Funktionsprüfungen für ISBN-Zuordnung, ungültige Antworten,
optionale Angaben, Bewertungen und Quellenlinks. Diese parallel entwickelte Funktion war nicht Teil
der ursprünglichen Erweiterung; die abschließende isolierte Prüfung nimmt die inzwischen vorhandenen
Tests mit auf.

## Ergänzende Funktionsprüfungen und Grenzen

- `isbn.spec.ts`, `library-data.spec.ts` und `universe-data.spec.ts` prüfen Datenfunktionen ohne Browser.
  Auch der erste Test in `book-cover-cache.spec.ts` ist eine reine Funktionsprüfung.
- `UserSelect` und `UserProfile` sind unbenutzte Platzhalter ohne Route oder Einbindung und daher
  nicht über die Oberfläche erreichbar. Sie werden nicht künstlich für einen Test eingebunden.
- Bestehende technische Renderer-Tests lesen teilweise interne Entwicklungszustände. Neue Nutzertests
  bedienen die sichtbare Oberfläche; Browser-API-Kontrollen simulieren Grafikfehler ohne Produktionshooks.
- Die Browserauswahl bleibt Chromium. Responsive Tests ändern dessen Viewport und ersetzen keine
  Prüfung auf echten Mobilgeräten oder mit anderen Browserengines.
- Die Matrix belegt die genannten Abläufe; sie behauptet keine vollständige Abdeckung aller möglichen
  Datenkombinationen, Browserzustände oder geometrischen Situationen.

## Ausgangsbefund dieser Erweiterung

Der vollständige Ausgangslauf vor den Änderungen ergab **212 bestandene und zwei fehlgeschlagene
Produkttests**. Beide Fehlschläge betrafen die unvollständige native Datumseingabe beim Anlegen bzw.
Bearbeiten. Der Browser liefert dafür einen leeren String mit `validity.badInput`; ein absichtlich
leeres optionales Datumsfeld liefert ebenfalls einen leeren String, aber ohne diesen Fehler.
Eine gemeinsame Angular-Validator-Direktive berücksichtigt deshalb zusätzlich den Browserzustand.
Der vorhandene kalendarische Validator und der API-Vertrag bleiben erhalten.

Die ergänzten Universe-Tastaturtests deckten außerdem auf, dass Escape im nativen Suchfeld zuerst
die Trefferliste schloss, dann aber den Text löschte und über das folgende Eingabeereignis die Liste
wieder öffnete. Der Escape-Handler verhindert diese native Standardaktion: Die Trefferliste schließt,
der Suchtext bleibt erhalten und das Feld behält den Fokus.
