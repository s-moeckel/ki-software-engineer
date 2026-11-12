# Eigenes Science-Fiction-Backend

Status: abgestimmt am 11. November 2026; auf Nutzerwunsch auf SQLite-Dateidatenbank vereinfacht

## User Story

Als BookMonkey-Nutzer möchte ich einen eigenen Science-Fiction-Buchbestand dauerhaft
in SQLite speichern, damit ich Bücher mit dem bestehenden Frontend suchen,
ansehen und bearbeiten kann.

## Ziel und Umfang

- Erfolg: Das bestehende Frontend verwendet die eigene API unter `http://localhost:4730`.
- Enthalten: Liste, Suche, Details, Bearbeitung und 300 echte Science-Fiction-Titel.
- Das Backend startet über npm und legt die SQLite-Datei selbst an. Docker Compose bleibt optional.
- Ein wiederholbares Init-Skript ergänzt fehlende Bücher ohne Duplikate und ohne
  vorhandene Bearbeitungen zu überschreiben.
- Rahmenbedingungen: dauerhafte Speicherung in SQLite, lokaler Workshopbetrieb,
  bestehender Frontend-Datenvertrag.
- Ausgeschlossen: Anmeldung, externer Katalogimport, neue Frontend-Funktionen und Deployment.

## Akzeptanzkriterien

### AK-1: Einfacher Start

Given Node.js ab Version 24 und installierte Backend-Abhängigkeiten
When `npm run backend` ausgeführt wird
Then startet die API und legt bei Bedarf die Datenbankdatei mit dem initialen Buchbestand an.

### AK-2: Bestehendes Frontend

Given das laufende Backend
When das bestehende Frontend Bücher auflistet, sucht, öffnet oder bearbeitet
Then funktionieren diese Abläufe mit dem bisherigen Datenformat.

### AK-3: Persistenz

Given ein gespeichertes Buch
When das Backend beendet und neu gestartet wird
Then bleibt die Änderung erhalten.

### AK-4: Wiederholbare Initialisierung

Given einen bereits initialisierten Bestand
When das Init-Skript erneut läuft
Then entstehen keine Duplikate
And vorhandene Bücher bleiben unverändert.

### AK-5: Fehlerfälle

Given eine unbekannte ISBN
When Details oder ein Update angefragt werden
Then antwortet die API mit HTTP 404.

Given ungültige Änderungen
When ein Update angefragt wird
Then weist die API die Änderung mit einem verständlichen Fehler zurück.

## Technische Hinweise

- Belegt: `src/app/books/book-api-client.service.ts` benötigt `GET /books` mit optionalem
  `q` und `_limit`, `GET /books/:isbn` und `PUT /books/:isbn`.
- Ohne Filter liefert die Liste die gesamte Sammlung, auch für Würfel, Library und Universe.
- Belegt: `src/app/books/book.ts` beschreibt den Datenvertrag. Updates bewahren
  `id`, `userId` und ISBN; `price` bleibt ein String.
- CORS erlaubt den Zugriff des lokalen Angular-Frontends.
- Ansatz: separates Node.js-/TypeScript-Backend mit Express, SQLite-Schema,
  Seed-Skript und lokaler Datenbankdatei; optional ein Docker-Volume.
- Prüfhinweise: API-Vertrag, Suche, Speichern, Persistenz und wiederholte Initialisierung.

## Offene Punkte und Annahmen

Keine offenen Entscheidungen. Vereinbart ist lokaler Betrieb ohne Anmeldung.
Die Titelauswahl wird bei der Umsetzung kuratiert; bibliografische Angaben
beziehen sich jeweils auf eine bestimmte Ausgabe.
