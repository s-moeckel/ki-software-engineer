# Regeln für Playwright-Tests

Diese Datei gilt für `tests/` und seine Unterverzeichnisse und ergänzt die Root-Anweisungen.

## Aufbau und Lesbarkeit

- Organisiere Produkttests pro Feature in einer `*.spec.ts`. `book-search.spec.ts` dient als Muster.
- Gruppiere Szenarien mit `test.describe`. Verwende verständliche deutsche Szenarionamen und
  `test.step('Given …')`, `test.step('When …')` und `test.step('Then …')`. Weitere When/Then-Paare sind bei
  mehrstufigen Abläufen sinnvoll. Neue Abhängigkeiten für Gherkin sind nicht erforderlich.
- Bündele wiederkehrende Selektoren und Bedienhandlungen in einem Feature-Page-Object unter `pages/`.
  Assertions, API-Mocks und Zeitsteuerung bleiben in der Spec sichtbar. Gemeinsame Mockdaten und
  API-Vertragsprüfungen gehören nach `support/`.
- Bestehende Specs müssen nur im Rahmen der jeweiligen Aufgabe auf dieses Muster umgestellt werden.

## Selektoren und Assertions

- Bevorzuge `getByRole` mit zugänglichem Namen und `getByLabel`. Nutze exakte Textselektoren für sichtbare
  Zustandsmeldungen. Ergänze `data-testid` gezielt, wenn semantische Selektoren nicht stabil oder eindeutig sind.
- Vermeide Selektoren anhand von CSS-Klassen, DOM-Positionen und Angular-Material-Interna.
- Prüfe beobachtbares Verhalten mit automatisch wiederholten Locator-Assertions wie `toBeVisible`,
  `toHaveText`, `toHaveValue`, `toHaveCount` und `toHaveURL`. Beschränke Prüfungen nicht auf HTTP-Requests.

## Deterministische Szenarien

- Registriere API-Mocks vor der Navigation. Verwende feste Daten und einen isolierten Zustand pro Test.
- Trenne Requests verschiedener Seitenbereiche anhand von Pfad und Parametern. Prüfe bei Suchrequests
  weiterhin den fachlichen Listenvertrag mit den vorhandenen Hilfsfunktionen.
- Produkttests benötigen weder ein laufendes Backend noch externe Bilder oder Dienste. Das vorhandene
  externe Playwright-Beispiel gehört nicht zur Produktprüfung.
- Steuere Debouncing und Timer mit `page.clock`; verwende keine festen `waitForTimeout`-Pausen.
  Synchronisiere Netzwerkanfragen über beobachtbare Zustände oder `expect.poll`.
- Decke Happy Path, Leerzustand und Fehler mit Wiederholung ab. Erhalte bei der Suche insbesondere die
  Prüfungen für Debouncing, verspätete Antworten, Clear und Cleanup bei Navigation.
- UI-Tests mit gemockter API prüfen Darstellung und Request-Vertrag; sie beweisen nicht die Filterlogik des Backends.

## Muster ausführen

```sh
npx playwright test tests/book-search.spec.ts --workers=1
npx playwright show-report
```

Playwright startet Angular selbst und erzeugt den HTML-Bericht. Unter Windows PowerShell kann bei
gesperrten PowerShell-Skripten `npx.cmd` statt `npx` verwendet werden.
