# Science-Fiction-Startbestand

`books.json` enthält 300 verschiedene echte Science-Fiction-Titel: die bisherigen
50 englischen Ausgaben sowie 250 zusätzlich aufgenommene deutsche Ausgaben.
Enthalten sind unter anderem Andreas Eschbach, Cliff Allister, Dominik A. Meier,
Andreas Brandhorst, Phillip P. Peterson, Brandon Q. Morris und Joshua Tree.

Die ursprünglichen 50 Einträge und ihre IDs/ISBNs bleiben unverändert. Ihre
ausgabenspezifischen Angaben stammen von Open Library (Abruf: 11. November 2026).
Die 250 Ergänzungen stammen aus dem Katalog der Deutschen Nationalbibliothek
(Abruf: 12. November 2026): deutschsprachige Buchausgaben mit überprüfter ISBN,
Verlag und Seitenzahl sowie Science-Fiction-Klassifikation. Pro Titel wird eine
Ausgabe verwendet. Reihen-/Bandangaben im Titel werden vereinheitlicht.
`sources.json` enthält für jede ISBN den zugehörigen Katalogeintrag und Abrufdatum.

Die ersten 50 Bücher besitzen eigens formulierte Inhaltsangaben. Die neuen
Einträge enthalten bibliografische Kurzbeschreibungen mit Reihenangaben und
gegebenenfalls ausdrücklich gekennzeichneten Katalog-Stichwörtern; sie sind keine
übernommenen Klappentexte. Seitenzahlen entsprechen der katalogisierten Ausgabe
und können von gerundeten Verlagsangaben abweichen.

`price` ist bewusst ein leerer String: Es sind keine aktuellen Verkaufspreise
hinterlegt. Preise können im bestehenden Editor gepflegt werden.
Cover werden beim ersten Bedarf über die [Open Library Covers API](https://openlibrary.org/dev/docs/api/covers)
geladen und im [Backend-Cache](../README.md#cover-cache) dauerhaft in SQLite gespeichert.
Bereits gespeicherte Cover stehen auch ohne Internet zur Verfügung. Bei fehlenden
oder noch nicht gespeicherten, nicht erreichbaren Bildern greift der bestehende Frontend-Fallback.
Die API selbst und die Datenbankinitialisierung benötigen keinen Online-Katalog.

## Bestand erweitern

Ein vollständiges Buch in `books.json` ergänzen. ISBN und `id` müssen eindeutig sein;
bestehende IDs bleiben stabil. `numPages` ist eine positive ganze Zahl, `price` ein
String und `userId` eine ganze Zahl. Eine bibliografische Quelle in `sources.json`
ergänzen. Anschließend das Backend vom Repository-Root neu starten:

```sh
npm run backend
```

Jeder Backendstart führt Schema und Seed in einer Transaktion aus. Bereits vorhandene
ISBNs bleiben vollständig unverändert; nur fehlende ISBNs werden ergänzt. Änderungen
an Seed-Einträgen ändern daher vorhandene Datenbankbücher nicht. Dafür den Editor nutzen.
Alternativ kann das Init-Skript explizit ausgeführt werden:

```sh
npm run build --prefix backend
npm run init --prefix backend
```

Das Skript legt eine frische Tabelle an, ersetzt aber kein Migrationensystem für
künftige Änderungen an bestehenden Tabellenspalten.

Bei optionalem Dockerbetrieb stattdessen mit `docker compose up --build -d` das
Image aktualisieren. Dort liegt die Datenbank im Docker-Volume; beim lokalen Start
liegt sie unter `backend/storage/bookmonkey.sqlite`.
