# BookMonkey Backend

Express-/TypeScript-API mit einer einfachen SQLite-Dateidatenbank und 1000 echten
Science-Fiction-Titeln. Eine separate Datenbankinstallation und Docker werden lokal nicht benötigt.
Die API bleibt mit dem bestehenden Angular-Frontend kompatibel.

## Einfach starten

Voraussetzung: Node.js ab Version 24. Vom Repository-Root:

```sh
npm ci --prefix backend
npm run backend
```

Das Backend läuft unter http://localhost:4730. Beim ersten Start wird automatisch
die Datei backend/storage/bookmonkey.sqlite angelegt und mit den 1000 Titeln gefüllt.
Weitere Starts erhalten eigene Bearbeitungen. Der Speicherpfad ist unabhängig davon,
aus welchem Ordner das Backend gestartet wird.

In einem zweiten Terminal das Frontend wie bisher starten:

```sh
npm start
```

Die Anwendung läuft unter http://localhost:4200. Eine laufende bookmonkey-api vorher
beenden, da sie ebenfalls Port 4730 verwendet. Liste, Suche, Library, Universe,
Würfel und Editor verwenden unverändert dieselbe API.

## Backend und Frontend gemeinsam debuggen

In VS Code im Bereich „Ausführen und Debuggen“ die Konfiguration **Backend + Frontend**
wählen und F5 drücken. Vorher einmal die Frontend- und Backend-Abhängigkeiten mit
`npm ci` und `npm ci --prefix backend` installieren. Node.js ab Version 24 und
Google Chrome werden benötigt. Bereits laufende Server auf Port 4200 und 4730 beenden.

VS Code baut das Backend, startet die API im Node-Debugger und Angular im
Entwicklungsmodus. Chrome öffnet erst nach Bereitschaft beider Dienste.
TypeScript-Breakpoints funktionieren in `backend/src/` und `src/app/`, beispielsweise
im GET-/PUT-Handler und im `BookApiClient`. Variablen und Call-Stacks erscheinen in
der jeweils ausgewählten Debug-Sitzung. Die Konfiguration verwendet
[Compound-Debugging](https://code.visualstudio.com/docs/debugtest/debugging-configuration#_compound-launch-configurations).

Beim Stoppen einer Debug-Sitzung beendet VS Code auch die andere. Der Angular-Task
kann zum erneuten Start weiterlaufen; bei Bedarf im Terminal über „Task beenden“
stoppen. Backend-Änderungen werden bei einem erneuten Debugstart neu gebaut;
das Debug-Backend verwendet keinen automatischen Watch-Neustart.
`Backend` und `ng serve` stehen auch als einzelne Debug-Konfigurationen zur Verfügung.
Ein Breakpoint im HTTP-Handler hält auch die Antwort an. Bei mehr als 15 Sekunden
Pause können die bestehenden Frontend-Timeouts auslösen; nach dem Fortsetzen den
Abruf wiederholen oder die Seite neu laden.
Die bisherige `ng test`-Konfiguration gehört nicht zu diesem Ablauf; das Karma-Testziel
ist weiterhin nicht als funktionierender Testnachweis eingerichtet.

## Datenbankdatei und Sicherung

SQLite speichert den Bestand in einer lokalen Datei. Der Ordner storage ist von Git
und vom Docker-Build ausgeschlossen. Für eine Sicherung das Backend beenden und
die SQLite-Datei kopieren; zum Wiederherstellen die Datei bei beendetem Backend
zurückkopieren. Während einer Transaktion kann SQLite eine temporäre Journaldatei
anlegen. Die Datenbank nicht bei laufendem Backend löschen oder austauschen.

Ein anderer Pfad lässt sich über DATABASE_FILE setzen, unter PowerShell etwa:

```powershell
$env:DATABASE_FILE = 'C:\BookMonkey\books.sqlite'
npm run backend
```

Übergeordnete Ordner werden automatisch angelegt. Relative benutzerdefinierte Pfade
beziehen sich auf das Arbeitsverzeichnis des Backendprozesses.

Die Implementierung verwendet das mit Node.js gelieferte
[node:sqlite-Modul](https://nodejs.org/api/sqlite.html), ohne zusätzliches Datenbankpaket.
Node 24 kann dafür einen ExperimentalWarning ausgeben. Die synchronen Datenbankzugriffe
passen zum kleinen lokalen Workshopbestand; ein gemeinsam betriebenes Backend mit
vielen gleichzeitigen Schreibern ist nicht Ziel dieser Variante.

## Startbestand und Init-Skript

Der [Startbestand](data/README.md) enthält 1000 verschiedene englische und deutsche Titel mit
deutschen Kurzbeschreibungen, unter anderem Dune, Foundation, Solaris, Neuromancer,
The Martian sowie Bücher von Becky Chambers und Ann Leckie.
[Bibliografische Quellen](data/sources.json) sind mitgeliefert. Verkaufspreise sind
nicht vorbelegt. Cover kommen optional von Open Library; fehlende Bilder werden
vom Frontend durch einen Fallback ersetzt.

## Cover-Cache

Open-Library-Cover, ISBN.de-Cover und Roman-Cover von `www.andreaseschbach.de` werden in allen
Ansichten über `GET /covers?url=…` geladen.
Das Backend speichert erfolgreiche Downloads dauerhaft als BLOB in der Tabelle
`cover_cache` derselben SQLite-Datei. Ein erneuter Aufruf benötigt dann keinen
externen Abruf, auch nach einem Backend-Neustart. Der Browser darf erfolgreiche
Bildantworten zusätzlich einen Tag zwischenspeichern.

Der erste Abruf bleibt von Open Library abhängig. Es laufen höchstens vier
externe Abrufe gleichzeitig. Open Library einschließlich seiner Weiterleitungen
ist auf höchstens 90 Abrufe in fünf Minuten begrenzt; BIC Media und Amazon-Bilder auf je 90 pro Minute
und ISBN.de auf 20 pro Minute.
Abrufbudgets und Fehlerpausen werden getrennt pro Quelle geführt, damit eine
nicht verfügbare Quelle die Ersatzquelle nicht blockiert. Gleichzeitige Anfragen derselben URL teilen sich
einen Download. Das liegt unter dem dokumentierten
[Limit für ISBN-basierte Cover](https://openlibrary.org/dev/docs/api/covers#rate-limiting).
Der Cache lädt nur angeforderte Cover, ohne vollständigen Katalog-Download.

Fehlende Bilder (404) werden 24 Stunden vermerkt. Vorübergehende Fehler werden eine
Minute vermerkt; bei 403/429 pausieren neue externe Abrufe für fünf Minuten.
Während einer Pause oder bei ausgeschöpftem Abrufbudget bleiben vorhandene
Cache-Treffer verfügbar; andere Bilder verwenden den bestehenden Fallback.
Nach Ablauf der Pause beim erneuten Öffnen der Ansicht oder Neuladen erneut versuchen.
Ein warmer Cache verbessert Folgeladevorgänge; der erstmalige Aufbau für viele Bilder
unterliegt weiterhin dem Anbieterlimit.

Ein Cache kann ein beim Anbieter fehlendes Bild nicht herstellen. Liefert Open
Library kein Bild oder ist vorübergehend nicht erreichbar, werden automatisch
`https://www.bic-media.com/dmrs/cover.do?isbn=<ISBN-13>&width=600`,
für ISBNs mit Präfix 978 die Amazon-Bildquelle mit berechneter ISBN-10 und danach
`https://buch.isbn.de/cover/<ISBN-13>.jpg` versucht. Erfolgreiche Ersatzbilder werden
ebenfalls dauerhaft gespeichert. Das gilt für den gesamten ISBN-13-Bestand, auch
bei bereits gespeicherten Open-Library-404-Antworten. Der bekannte HTTP-200-
Platzhalter „Kein Bild gefunden“, Weiterleitungen auf `/nopic.png` sowie leere
oder bekannte weiße BIC-Media-Platzhalter werden als 404 behandelt und nicht als
Buchcover gespeichert. Einpixel-GIFs der Amazon-Bildquelle gelten ebenfalls als
fehlend. Eine vorübergehend nicht verfügbare Quelle bleibt als wiederholbarer
Fehler erhalten, wenn keine andere Quelle ein Cover liefert; eine spätere 404
verdeckt diesen Zustand nicht. HTTP 403/429 pausiert die betroffene Quelle für mindestens
fünf Minuten; ein längerer `Retry-After`-Wert wird berücksichtigt.

Für geprüfte Titelcover enthält `src/cover-fallbacks.ts` zusätzlich eine Zuordnung nach ISBN. Bei
„Teufelsgold“ wird nach einer Open-Library-404 das Cover von der offiziellen
Autorenseite geladen und ebenfalls dauerhaft gespeichert. Das gilt auch für
bereits gespeicherte 404-Antworten. Dieses Titelcover zeigt die Hardcovergestaltung;
es muss nicht dem Umschlag der katalogisierten Taschenbuchausgabe entsprechen.
Eigene Cover-URLs und vorhandene erfolgreiche Open-Library-Bilder bleiben erhalten.

Downloads haben ein Timeout von acht Sekunden pro HTTP-Abruf und ein Größenlimit
von drei MiB. Es werden nur validierte Open-Library-Cover-URLs, Roman-Cover unter
`https://www.andreaseschbach.de/werke/romane/<roman>/files/<bild>` (JPG, JPEG, PNG
oder WebP) und JPEG-, PNG-, GIF- oder WebP-Daten akzeptiert. Beispielsweise wird
`https://www.andreaseschbach.de/werke/romane/schlaumann/files/Schlaumann.jpg`
beim ersten erfolgreichen Abruf dauerhaft gespeichert. ISBN.de-URLs sind auf
`https://buch.isbn.de/cover/<ISBN-13>.jpg` begrenzt. BIC Media ist ausschließlich
für `/dmrs/cover.do` mit genau `isbn=<ISBN-13>` und `width=600` zugelassen.
Amazon-Bilder sind auf `https://images-eu.ssl-images-amazon.com/images/P/<ISBN-10>.01.LZZZZZZZ.jpg`
begrenzt. Unbekannte Hosts, andere Pfade und zusätzliche BIC-Parameter werden abgewiesen.
Dazu diese URL als Cover
im Bucheditor hinterlegen; der Erstabruf muss die Quelle erreichen können.
Weiterleitungen werden bis zu drei Schritte lang nur
zu diesen Cover-Quellen und den offiziellen Internet-Archive-Cover-ZIP-/CDN-Adressen
verfolgt. Andere externe URLs, private Hosts und andere Archivdateien können nicht
über den Endpunkt abgerufen werden.

Die ursprüngliche Cover-URL im Buch und Editor bleibt unverändert. Nur die Anzeige
verwendet den Cache-Endpunkt; eigene Cover anderer Anbieter behalten ihr bisheriges
Verhalten. Eine geänderte Quell-URL erzeugt einen neuen Cache-Eintrag. Erfolgreiche
Cache-Einträge werden nicht automatisch aktualisiert.

## Initialisierung und Erweiterung

Jeder Backendstart initialisiert Schema und Seed in einer Transaktion. Das Skript
lässt sich auch ausdrücklich ausführen:

```sh
npm run build --prefix backend
npm run init --prefix backend
```

Nur fehlende ISBNs werden ergänzt; bestehende Einträge bleiben unverändert.
BEGIN IMMEDIATE serialisiert Schreibzugriffe; ein Fehler rollt die gesamte
Initialisierung zurück. Zum Erweitern neue Bücher und Quellen in data ergänzen.
Bei lokalem Betrieb genügt anschließend ein Neustart; bei Docker das Image neu bauen.
Das Schema legt die Tabelle an. Künftige Änderungen bestehender Spalten benötigen
eigene Migrationen.

## API-Vertrag

| Anfrage                        | Verhalten                                                         |
| ------------------------------ | ----------------------------------------------------------------- |
| GET /books                     | Vollständige Sammlung als JSON-Array, stabil nach id sortiert     |
| GET /books?\_limit=10          | Höchstens zehn Treffer; \_limit=0 liefert ein leeres Array        |
| GET /books?q=asimov&\_limit=10 | Suche vor Begrenzung, ohne Beachtung der Groß-/Kleinschreibung    |
| GET /books/:isbn               | Vollständiges Buch anhand der URL-kodierten ISBN                  |
| POST /books                    | Buch anlegen; HTTP 201 mit vollständigem Buch und Location-Header |
| PUT /books/:isbn               | Vollständiges Buch speichern und gespeicherten Stand zurückgeben  |
| GET /health                    | HTTP 200 bei verfügbarer Datenbank, sonst 503                     |
| GET /covers?url=…              | Open-Library-Cover aus SQLite oder begrenzter externer Erstabruf  |

q ist eine zusammenhängende Teilzeichenfolge in Titel, Untertitel, Autor, Verlag,
Beschreibung oder ISBN. Äußere Leerzeichen werden entfernt; Prozentzeichen und
Unterstriche werden wörtlich gesucht. Die Suche berücksichtigt Unicode-Groß- und
Kleinschreibung. Maximal 500 Zeichen sind erlaubt. \_limit muss eine nichtnegative
sichere ganze Zahl sein. Fehlende Parameter bedeuten keine Filterung/Begrenzung.
Alle SQL-Werte werden über gebundene Parameter übergeben.

```ts
interface Book {
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
}
```

`POST /books` erwartet ISBN, Titel, Autor und numPages. Untertitel, Verlag, Preis,
Cover-URL und Beschreibung sind optional und werden bei fehlender Angabe als leere
Strings gespeichert. Die JSON-Feldnamen entsprechen `Book`. Der Server erzeugt
`id` als UUID und setzt `userId` für den lokalen Betrieb ohne Anmeldung auf `1`;
mitgesendete Identitätsfelder werden ignoriert. Äußere Leerzeichen der ISBN werden
entfernt. Eindeutigkeit prüft SQLite atomar anhand dieser ISBN, auch bei parallelen
Anfragen oder einem erneuten Versuch nach Verbindungsabbruch. Weitere Normalisierung
oder Prüfziffernvalidierung findet nicht statt. Eine vorhandene ISBN liefert HTTP
409 mit ausdrücklicher Fehlermeldung; das vorhandene Buch bleibt unverändert.
HTTP 201 liefert das gespeicherte vollständige Buch und `Location: /books/<ISBN>`.
Neue Bücher sind über Liste, Suche und Details verfügbar und bleiben nach Neustarts
erhalten. Die Listenbegrenzung und Sortierung gelten auch für neue Einträge.

Updates erhalten id, ISBN und userId. Titel und Autor dürfen nicht leer sein;
numPages muss eine positive ganze Zahl im 32-Bit-Bereich sein. price bleibt ein
String, auch bei leerem Wert. Ein fehlender Untertitel wird als leerer String
gespeichert. Unbekannte ISBNs liefern 404, ungültige Daten 400, Identitätsänderungen
409, zu große Anfragekörper 413 und Datenbankfehler 503. Fehlerantworten enthalten
ein error-Feld. Gleichzeitige gültige Bearbeitungen verwenden den zuletzt
gespeicherten Stand; eine Versionskonfliktprüfung gehört nicht zum bisherigen Vertrag.

PORT ist standardmäßig 4730. CORS_ORIGINS ist eine kommaseparierte Liste und erlaubt
standardmäßig http://localhost:4200 und http://127.0.0.1:4200.
Es wird keine .env-Datei automatisch eingelesen. Der Betrieb ist lokal und ohne Anmeldung vorgesehen.

## Prüfungen

```sh
npm test --prefix backend
```

Das Testziel baut zunächst das Backend. Tests verwenden eigene temporäre SQLite-Dateien,
die anschließend entfernt werden; die normale Datenbank bleibt unverändert.
Sie prüfen Datenformat, 1000 eindeutige Titel, ISBN-Prüfsummen, Suche/Limit, Details,
Speichern, Validierung, CORS, Fehlerantworten, Rollback und Persistenz über
Prozessneustarts sowie die Init-CLI. Die Cover-Tests prüfen dauerhafte Treffer,
zusammengefasste Downloads, Limits, Ablauf fehlender Bilder und sichere Fehlerbehandlung
mit simulierten HTTP-Antworten. Browserprüfungen für die Darstellung und Bearbeitung:

```sh
npx playwright test tests/book-cover-cache.spec.ts tests/book-details.spec.ts tests/book-random.spec.ts --project=chromium
```

## Optional: Docker

```sh
docker compose up --build -d
docker compose --profile test run --build --rm backend-test
docker compose exec backend npm run init
docker compose down
```

Compose startet nur das Backend. Die Datei liegt im benannten Volume bookmonkey-files;
down erhält das Volume, down -v löscht es samt Bearbeitungen. Der Container läuft
mit Node 24 und ohne root-Benutzer. Port 4730 ist ausschließlich an localhost gebunden.
Die lokale SQLite-Datei und die Datei im Docker-Volume sind getrennte Bestände.
