---
name: angular21-signal-forms
description: Verwenden, wenn BookMonkey auf Angular 21 aktualisiert oder seine Reactive Forms auf Angular Signal Forms migriert werden sollen. Gilt für Buchsuche, Anlege- und Bearbeitungsdialoge; nicht für allgemeine Signal-Refactorings oder Upgrades auf andere Hauptversionen.
---

# Angular 21 und Signal Forms für BookMonkey

Migriere in zwei getrennt prüfbaren Phasen: zuerst auf die neueste stabile Angular-21.x-Version, danach auf `@angular/forms/signals`. Signal Forms sind in Angular 21 experimentell. Verwende ausschließlich APIs, die in der gewählten 21.x-Version verfügbar sind; aktuelle Dokumentation für spätere Hauptversionen ist kein Kompatibilitätsnachweis.

Ein Auftrag zum Erstellen oder Ändern dieses Skills startet keine Anwendungsmigration. Bei einem Migrationsauftrag beachte dessen Umfang: nur Upgrade, nur Formularumbau oder beide Phasen. Ein Formularumbau setzt einen nachgewiesen funktionierenden Angular-21-Stand voraus. Eine bereits vorhandene Freigabe des konkreten Migrationsplans gilt weiter.

## Bestandsaufnahme und Quellen

- Lies die geltenden `AGENTS.md`, `README.md`, `ARCHITECTURE.md` und die betroffenen Komponenten samt Tests. Gleiche Dokumentation mit dem aktuellen Code ab. Prüfe `package.json`, Lockfile, Angular-/Playwright-Konfiguration sowie die tatsächlichen Node.js- und npm-Versionen.
- Prüfe `git status` und relevante Diffs. Bewahre fremde Änderungen; führe weder Reset noch Stash oder automatische Commits aus. Verlangt eine Update-Migration einen sauberen Arbeitsstand, verwende einen geeigneten isolierten Arbeitsstand und prüfe, ob dort die erforderlichen lokalen Änderungen vorliegen. Umgehe die Prüfung nicht pauschal mit `--allow-dirty`.
- Ermittle klassische Formularverwendungen im gesamten Anwendungscode, insbesondere `FormControl`, `FormGroup`, `ReactiveFormsModule`, `FormsModule`, `ngModel`, `formControlName` und `valueChanges`. Der bekannte Ausgangsumfang umfasst Buchsuche, Anlege- und Bearbeitungsdialog; neue Fundstellen anhand ihres Zwecks einordnen.
- Nutze Angular-MCP für Best Practices und Dokumentationssuche, sofern verfügbar. Für Versionsfragen und fehlende Informationen nutze offizielle Angular-Dokumentation, Release-Tags und Paketmetadaten. Halte die geprüften Quellen und konkreten Zielversionen fest.

Offizielle Einstiegspunkte:

- [Update Guide](https://angular.dev/update-guide) – explizit von der vorhandenen Version auf 21 einstellen.
- [Versionskompatibilität](https://angular.dev/reference/versions) – Node.js, TypeScript und RxJS.
- [Angular-21-Signal-Forms-Tutorial](https://v21.angular.dev/tutorials/signal-forms) und [form-API](https://v21.angular.dev/api/forms/signals/form).

## Phase 1: Angular-Upgrade

1. Ermittle die neueste stabile 21.x-Version aus offiziellen Paketmetadaten; keine Vorabversionen und kein unbeschränktes `latest`. Prüfe Angular-Core, CLI, Build, Compiler, Forms, Router, vorhandene SSR-Pakete sowie Material/CDK auf kompatible Versionen. Die Paketfamilien müssen kompatibel sein, aber nicht zwingend dieselbe Patchnummer haben.
2. Prüfe Peer-Abhängigkeiten aller betroffenen Pakete, insbesondere NgRx, NgRx Toolkit und Angular Query. Löse konkrete Konflikte mit kompatiblen Versionen. Verwende weder `--force` noch `--legacy-peer-deps`; entferne keine vorhandenen Pakete beiläufig. Ist die Anwendung bereits auf einer späteren Hauptversion, melde den Zielkonflikt statt sie auf 21 zurückzustufen.
3. Führe die offiziellen `ng update`-Migrationen für Core/CLI und Material aus, mit auf Hauptversion 21 begrenzten Zielen. Passe weitere Abhängigkeiten nur soweit für das Upgrade erforderlich an und aktualisiere das Lockfile konsistent. Prüfe automatisch erzeugte Änderungen auf ihren Bezug zur Migration.
4. Führe `npm run build` und die BookMonkey-Playwright-Suite aus. Vergleiche mit dem Ausgangsstand und behebe Upgrade-Regressionen vor dem Formularumbau. Bei einer blockierten Zwischenprüfung berichte das Hindernis; kennzeichne die Phase nicht als erfolgreich.

Ergänze keine eigenständige Zoneless-Migration, keinen Store, keinen Testframeworkwechsel und keine Backend-Umgestaltung. Verhindere solche beiläufigen Änderungen auch bei automatisch vorgeschlagenen Migrationen.

## Phase 2: Signal Forms

- Prüfe vor der Umsetzung die Exporte und Typdefinitionen der tatsächlich installierten `@angular/forms/signals`-Version. Verifiziere insbesondere Feld-Direktive, Validierungs-, Reset-, Disabled- und Submission-APIs. Übernimm keine Beispiele aus Angular 22 oder `next`, ohne ihre Verfügbarkeit in 21 nachzuweisen.
- Ersetze die klassischen Formulare durch typisierte, lokale Signal-Modelle und daraus erzeugte Formularbäume. Bewahre die bestehenden Zuständigkeiten und HTTP-Clients. Bearbeitungsentwürfe müssen vom geladenen Original und den Listendaten unabhängig bleiben.
- Übertrage Validierung und Zustandswechsel: Pflichtfelder und reine Leerzeichen, positive ganzzahlige Seitenzahlen, leere numerische Eingaben sowie die jeweils vorhandenen Grenzen. Die Anlegemaske begrenzt Seitenzahlen derzeit auf `2_147_483_647`; vereinheitliche Unterschiede zum Bearbeitungsdialog nicht nebenbei. `price` bleibt ein String, ISBN und sonstige Identitätsfelder behalten ihren API-Vertrag.
- Bewahre Fehleranzeige nach Berührung beziehungsweise Absendeversuch, Reset beim Bearbeitungsbeginn und Abbrechen, deaktivierte Felder während des Speicherns sowie die vorhandene Behandlung des ISBN-Duplikatfehlers (HTTP 409).
- Erhalte Schutz vor doppeltem Absenden, Schließsperre und 15-Sekunden-Timeouts. Bestätigte Fehler erhalten den Entwurf und erlauben Retry. Bei Timeout oder Status 0 bleiben der unbestätigte Zustand, dessen Schließverhalten und die unterschiedlichen Wiederherstellungsabläufe für Anlegen und Bearbeiten erhalten. Ein unbestätigtes Speichern darf keinen Erfolgs-Toast auslösen.
- Erhalte bei der Suche 300 ms Debouncing, sofortigen Abbruch des bisherigen Requests und das Verbergen alter Ergebnisse bereits bei Eingabe. Clear und Reload löschen ausstehende Timer; Clear lädt sofort und setzt wie Suche Seite 1. Wiederholung und Dialogaktualisierung bewahren die angeforderte Seite einschließlich Korrektur bei geschrumpfter Trefferzahl. Verhindere zusätzliche Requests durch die Initialisierung der Signal-Anbindung und bewahre Lifecycle-Cleanup.
- Prüfe die Material-Integration mit der installierten 21.x-Version ausdrücklich: `matInput`, `mat-form-field`, sichtbare `mat-error`-Meldungen, Fehlerzustand, Required-/Disabled-Zustand, Labels, Tastaturbedienung und Dialogfokus. Eine Übergangsbrücke nur bei nachgewiesenem Bedarf verwenden und verbleibende klassische Formularanteile begründen; sie ersetzen keine abgeschlossene Signal-Forms-Migration.

## Verifikation und Abschluss

- Erfasse vor dem Umbau den vorhandenen Build- und Teststand. Ergänze fehlende Verhaltenstests insbesondere für Formularzustände und Such-Cleanup und führe sie vor und nach der Änderung aus. Bereits erfülltes Verhalten benötigt keine künstlich roten Tests. Bewahre die fachlichen Assertions.
- Gezielter Lauf: `npx playwright test tests/book-details.spec.ts tests/book-create.spec.ts tests/book-search.spec.ts tests/book-pagination.spec.ts`. Prüfe gültige/ungültige Eingaben, Abbrechen und erneutes Bearbeiten, erfolgreiche Speicherung, HTTP-Fehler und Retry, Duplikate, unbestätigtes Speichern, Antwortreihenfolge, Clear und Cleanup beim Verlassen der Seite.
- Führe nach jeder Phase `npm run build` und alle aktuellen BookMonkey-Tests unter `tests/` in den konfigurierten Browserprojekten aus. Ermittle dafür die tatsächliche Dateiliste und schließe `tests/example.spec.ts` ausdrücklich als externen Beispieltest aus. Die API-Mocks benötigen kein laufendes Backend. Behandle das unvollständige Karma-Ziel `npm test` nicht als Testnachweis; repariere es nicht nebenbei.
- Formatiere nur geänderte Dateien gemäß Repository-Konventionen. Prüfe den abschließenden Diff und suche erneut nach klassischen Formularverwendungen. Ordne jeden verbleibenden Fund zu und begründe ihn; unvollständig migrierte Zielformulare als offen ausweisen.
- Berichte pro Phase Ziel-/Ist-Versionen, ausgeführte Befehle mit Ergebnissen, bewahrte Verträge und begründete Abweichungen. Benenne blockierte oder nicht ausgeführte Checks ausdrücklich. Ein Upgrade allein erfüllt keinen Auftrag für beide Phasen.
