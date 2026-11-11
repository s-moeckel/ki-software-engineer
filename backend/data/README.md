# Science-Fiction-Startbestand

`books.json` enthält 50 verschiedene echte Titel: Klassiker, Space Opera, Cyberpunk,
gesellschaftliche Science-Fiction und neuere Romane. Die Auswahl enthält englische
Ausgaben mit deutschen, eigens formulierten Kurzbeschreibungen.

ISBN, Verlag und Seitenzahl stammen aus ausgabenspezifischen Open-Library-Einträgen,
abgerufen am 11. November 2026. `sources.json` dokumentiert für jede ISBN die Quelle.
Titel sind einheitlich geschrieben; Liu Cixins Name ist romanisiert. Katalogdaten
können fehlerhaft sein und sind keine Verlagsgarantie.

`price` ist bewusst ein leerer String: Es sind keine aktuellen Verkaufspreise
hinterlegt. Preise können im bestehenden Editor gepflegt werden.
Cover werden optional über die [Open Library Covers API](https://openlibrary.org/dev/docs/api/covers)
geladen. Bei fehlenden Bildern oder ohne Internet greift der bestehende Frontend-Fallback.
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
