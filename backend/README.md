# BookMonkey Backend

Express-/TypeScript-API mit einer einfachen SQLite-Dateidatenbank und 50 echten
Science-Fiction-Titeln. Eine separate Datenbankinstallation und Docker werden lokal nicht benötigt.
Die API bleibt mit dem bestehenden Angular-Frontend kompatibel.

## Einfach starten

Voraussetzung: Node.js ab Version 24. Vom Repository-Root:

```sh
npm ci --prefix backend
npm run backend
```

Das Backend läuft unter http://localhost:4730. Beim ersten Start wird automatisch
die Datei backend/storage/bookmonkey.sqlite angelegt und mit den 50 Titeln gefüllt.
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

Der [Startbestand](data/README.md) enthält 50 verschiedene englische Titel mit
deutschen Kurzbeschreibungen, unter anderem Dune, Foundation, Solaris, Neuromancer,
The Martian sowie Bücher von Becky Chambers und Ann Leckie.
[Bibliografische Quellen](data/sources.json) sind mitgeliefert. Verkaufspreise sind
nicht vorbelegt. Cover kommen optional von Open Library; fehlende Bilder werden
vom Frontend durch einen Fallback ersetzt.

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

| Anfrage                        | Verhalten                                                        |
| ------------------------------ | ---------------------------------------------------------------- |
| GET /books                     | Vollständige Sammlung als JSON-Array, stabil nach id sortiert    |
| GET /books?\_limit=10          | Höchstens zehn Treffer; \_limit=0 liefert ein leeres Array       |
| GET /books?q=asimov&\_limit=10 | Suche vor Begrenzung, ohne Beachtung der Groß-/Kleinschreibung   |
| GET /books/:isbn               | Vollständiges Buch anhand der URL-kodierten ISBN                 |
| PUT /books/:isbn               | Vollständiges Buch speichern und gespeicherten Stand zurückgeben |
| GET /health                    | HTTP 200 bei verfügbarer Datenbank, sonst 503                    |

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
Sie prüfen Datenformat, 50 eindeutige Titel, ISBN-Prüfsummen, Suche/Limit, Details,
Speichern, Validierung, CORS, Fehlerantworten, Rollback und Persistenz über
Prozessneustarts sowie die Init-CLI.

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
