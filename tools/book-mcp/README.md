# BookMonkey MCP

Lokaler TypeScript-MCP-Server analog zu `tools/angular-mcp`, mit dem bereits
installierten MCP SDK und stdio als Transport. Er liest die Bibliothek über die
bestehende HTTP-API: dieselben Daten und gespeicherten Änderungen wie im Frontend,
ohne eigene Datenbank oder Kopie des Startbestands. Alle Werkzeuge sind lesend.

## Vorbereitung

Node.js ab Version 24, Installation und Build vom Repository-Root:

```sh
npm ci
npm ci --prefix backend
npm run build.book-mcp
npm run backend
```

Das Backend in diesem Terminal laufen lassen. Der MCP-Client startet den
MCP-Prozess selbst mit `node dist/book-mcp/index.js` im Repository-Root.
Für manuellen Start steht auch `npm run start.book-mcp` bereit. Der Prozess
wartet auf MCP-Nachrichten über stdin; er bietet keinen HTTP-Endpunkt im Browser.
Für Client-Konfigurationen direkt `node` verwenden, damit npm-Startmeldungen
die JSON-RPC-Kommunikation auf stdout nicht stören.

Unter PowerShell mit gesperrten npm-Skripten `npm.cmd` statt `npm` verwenden.
Nach Änderungen am MCP-Code den Build erneut ausführen und den MCP-Client neu verbinden.

## Werkzeuge

| Werkzeug       | Parameter                                                                                        | Ergebnis                                     |
| -------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `list_books`   | `limit?`: nichtnegative sichere Ganzzahl                                                         | Buchbestand als JSON-Array, nach ID sortiert |
| `search_books` | `query`: 1–500 Zeichen nach Entfernen äußerer Leerzeichen, Eingabe maximal 500 Zeichen; `limit?` | Passende Bücher als JSON-Array               |
| `get_book`     | `isbn`: ISBN aus der Bibliothek                                                                  | Vollständiges Buch als JSON-Objekt           |

Ohne `limit` wird die gesamte Sammlung geliefert; `limit: 0` liefert keine Treffer.
Die Suche verwendet den API-Vertrag: zusammenhängende Teilzeichenfolge in Titel,
Untertitel, Autor, Verlag, Beschreibung oder ISBN, unabhängig von Groß- und
Kleinschreibung. Die Suche erfolgt vor der Begrenzung. `price` bleibt ein String.
Die ISBN wird als exakter API-Schlüssel behandelt und URL-kodiert.

Beispielaufrufe: `list_books({"limit":10})`,
`search_books({"query":"Herbert","limit":5})`,
`get_book({"isbn":"9780441172719"})`.

Leere Treffer sind erfolgreiche Ergebnisse. Nicht gefundene Bücher,
Backendfehler, ungültige Antworten und Zeitüberschreitungen nach 15 Sekunden
werden als MCP-Toolfehler (`isError: true`) gemeldet. Abbruchsignale des Clients
werden an laufende HTTP-Anfragen weitergereicht. Es gibt keinen Schreibzugriff.

## Codex und andere MCP-Clients

In [`.codex/config.toml`](../../.codex/config.toml) ist `bookmonkey_mcp` bereits
eingetragen. Nach dem Build und Backendstart Codex neu verbinden beziehungsweise
neu starten. Der absolute `cwd` zeigt auf dieses Checkout; nach Verschieben des
Repositories oder auf einem anderen Rechner diesen Pfad anpassen.
Projektkonfigurationen werden gemäß der
[offiziellen Codex-MCP-Dokumentation](https://learn.chatgpt.com/docs/extend/mcp)
in `.codex/config.toml` hinterlegt.

Andere MCP-Clients können diesen stdio-Eintrag verwenden und den Beispielpfad ersetzen:

```json
{
  "mcpServers": {
    "bookmonkey_mcp": {
      "command": "node",
      "args": ["C:/Pfad/zum/Repository/dist/book-mcp/index.js"],
      "env": { "BOOKMONKEY_API_URL": "http://localhost:4730" }
    }
  }
}
```

`BOOKMONKEY_API_URL` ist optional und standardmäßig `http://localhost:4730`.
HTTP(S)-Basisadressen mit optionalem Pfadpräfix sind möglich; Zugangsdaten,
Query und Fragment sind ausgeschlossen. In Codex den Wert im vorhandenen
`env`-Abschnitt ändern. Das Backend muss aus dem MCP-Prozess erreichbar sein.

## Prüfungen

```sh
npm run test.book-mcp
npm run build
```

Die Node-Tests prüfen MCP-Handshake, Werkzeugliste, Parametervalidierung,
API-Parameter, unveränderte Buchfelder, leere Treffer, HTTP-/Format-/Netzwerkfehler,
Timeout und den tatsächlichen stdio-Prozess mit einer temporären HTTP-Test-API.
Ein laufendes Backend und Browser sind dafür nicht nötig; die normale Datenbank
wird nicht verändert.

Das verwendete stdio-Muster entspricht dem
[MCP TypeScript SDK v1](https://ts.sdk.modelcontextprotocol.io/server).
