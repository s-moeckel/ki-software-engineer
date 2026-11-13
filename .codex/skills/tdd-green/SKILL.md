---
name: tdd-green
description: Führt Implementierungsaufträge für Features und Fehlerkorrekturen verpflichtend durch Planfreigabe und den vollständigen TDD-Zyklus Red → Green → Refactor. Auch ohne vorbereitete Tests einsetzen. Legt zuerst den Umsetzungsplan zur Entscheidung vor und führt nach ausdrücklicher Freigabe alle drei Phasen bis zum geprüften Abschluss aus.
---

# Implementierung: Planfreigabe und Red → Green → Refactor

Dieser Skill ist der Einstieg für Implementierungsaufträge und steuert den vollständigen TDD-Zyklus. Analysiere Anforderungen, vorhandene Tests und Code und lege den konkreten Plan dem Nutzer zur Entscheidung vor. Beginne Änderungen erst nach seiner ausdrücklichen Freigabe dieses Plans. Führe danach verbindlich Red → Green → Refactor aus; fehlende vorbereitete Tests sind ein Auftrag für Red und kein Grund, den Ablauf nicht zu starten. Der bestehende Skill-Name `tdd-green` bleibt als Einstieg erhalten.

## Verbindlicher Phasenablauf

1. **Plan:** Analysiere den Arbeitsstand und lege den Plan wie unten beschrieben vor. Eine bereits vorhandene Red-Prüfung kann einfließen; sie ist keine Voraussetzung für die Planung.
2. **Red:** Lies [tdd-red](../tdd-red/SKILL.md) und wende dessen Testregeln an. Erstelle nach Planfreigabe die fehlenden Verhaltenstests und führe sie vor Produktionsänderungen aus. Sind passende Tests vorhanden, reproduziere deren Fehler. Halte tatsächliche Fehlerursachen fest; Infrastrukturfehler zählen nicht als fachliches Red. Bereits erfülltes Verhalten benötigt keine künstlich roten Tests.
3. **Green:** Implementiere anhand der folgenden Green-Regeln den kleinsten fachlich korrekten Produktionscode und weise die betroffenen Tests grün nach. Überspringe Red nicht zugunsten einer direkten Implementierung.
4. **Refactor:** Lies [tdd-refactor](../tdd-refactor/SKILL.md) und prüfe die grüne Lösung verbindlich auf sinnvolle verhaltensbewahrende Bereinigungen im freigegebenen Umfang. Setze erforderliche Bereinigungen um und prüfe sie erneut. Ist keine Bereinigung sinnvoll, dokumentiere diese Entscheidung; erzeuge keinen Umbau nur zum Nachweis der Phase.
5. **Abschluss:** Berichte Red-Nachweis, Green-Nachweis, Refactor-Ergebnis und die abschließenden projektrelevanten Prüfungen. Melde den Auftrag erst nach allen drei Phasen als abgeschlossen.

Die Planfreigabe umfasst diesen vollständigen Ablauf. Wechsle nach Freigabe selbstständig zwischen den Phasen, ohne erneut einen Startauftrag oder eine Freigabe pro Phase zu verlangen. Die Übergabe am Ende des Red-Skills ist hier eine interne Übergabe an Green; dessen Stoppregel gilt nur bei einem eigenständigen Red-Auftrag. Bei echten Hindernissen benenne den blockierten Schritt und arbeite an unabhängigen freigegebenen Teilen weiter; behaupte keinen vollständigen TDD-Nachweis.

## Tests und Erwartungen übernehmen

- Nutze übergebene Testdateien, Testtitel, Fehlermeldungen und gegebenenfalls die Szenario-Zuordnung aus der Red-Phase. Eine bestimmte Übergabeform oder die Verfügbarkeit einer anderen Skill ist nicht erforderlich. Liegen nur Fehlermeldungen vor, suche die zugehörigen Tests im Repository.
- Lies die geltenden `AGENTS.md`-Dateien, relevante Anforderungen und API-Verträge, die betroffenen Tests samt Fixtures sowie den zugehörigen Produktionscode. Prüfe Testkonfiguration und Skripte am aktuellen Stand.
- Leite aus Setup, Aktion und Assertions das erwartete beobachtbare Verhalten ab. Ordne jedem fehlschlagenden Szenario die fehlende Funktion oder verletzte Regel zu; beachte auch Fehlerfälle und asynchrone Abläufe, soweit getestet oder vereinbart.
- Fehlen Tests bei hinreichend klaren Anforderungen, plane ihre Erstellung in Red ein und führe sie nach Planfreigabe aus. Kläre nur fehlende oder widersprüchliche Anforderungen gezielt. Erfinde keine fachlichen Regeln oder API-Verträge. Bearbeite unabhängige, eindeutige Szenarien weiter.
- Prüfe den bestehenden Arbeitsstand vor Änderungen. Bewahre vorbereitete, auch noch nicht versionierte Tests und sonstige Arbeiten des Entwicklers.

## Vorhandenes Red reproduzieren und Ursache bestimmen

Sind betroffene Tests vorhanden, führe sie zunächst gezielt mit dem vorhandenen Runner aus. Fehlende Tests werden erst nach Planfreigabe in Red erstellt und ausgeführt. Unterscheide fehlendes Produktverhalten, fehlende produktive Schnittstellen, Testfehler und Infrastrukturprobleme. Ein fehlender Browser, defektes Setup oder nicht erreichbarer Dienst belegt kein fehlendes Feature.

Bereits grüne Tests benötigen keine zusätzliche Implementierung. Fehlende produktive Imports, Typen oder öffentliche Schnittstellen aus dem Testentwurf gehören zur Implementierung, sofern sie den vereinbarten Anforderungen entsprechen. Behandle sie nicht pauschal als fehlerhafte Tests.

## Umsetzungsplan vorlegen und Freigabe abwarten

- Erstelle auf Grundlage der Analyse einen konkreten, prüfbaren Plan für Red, Green und Refactor: zu erfüllende Szenarien, vorhandene und noch zu erstellende Tests, betroffene Dateien und ihre geplanten Änderungen, wesentliche technische Entscheidungen sowie vorgesehene Tests und Build-Prüfungen. Benenne offene Entscheidungen und relevante Risiken; gib bei Alternativen eine begründete Empfehlung.
- Speichere den vollständigen Plan vor der Freigabe als Markdown-Datei unter `.plans/YYYY-MM-DD-<thema>.md` im Repository-Root. Lege den Ordner bei Bedarf an und wähle einen eindeutigen, sprechenden Dateinamen. Stelle sicher, dass `/.plans/` in der Root-`.gitignore` steht; ergänze den Eintrag bei Bedarf und prüfe mit `git check-ignore <plandatei>`, dass die Datei ignoriert wird. Pläne bleiben lokale Arbeitsdateien und werden nicht versioniert.
- Verlinke die gespeicherte Plandatei im Gespräch, fasse die wesentlichen Schritte kurz zusammen und bitte ausdrücklich um die Entscheidung des Nutzers: freigeben oder ändern. Beende diesen Schritt mit dem Hinweis, dass dieser Skill vor der Implementierung eine Planfreigabe verlangt, und verlinke diese `SKILL.md`.
- Warte auf die ausdrückliche Freigabe des vorgelegten Plans. Ein allgemeiner Implementierungsauftrag, der Skill-Aufruf oder ausbleibender Widerspruch gelten nicht als Planfreigabe. Bis dahin sind lesende Analyse, Testläufe sowie das Anlegen und Aktualisieren der Plandatei und des zugehörigen `.gitignore`-Eintrags erlaubt; ändere keinen Produktionscode, keine Tests, Fixtures, Abhängigkeiten oder sonstige Konfiguration und beginne keine Teilimplementierung.
- Arbeite Änderungswünsche in dieselbe Plandatei ein und lege den überarbeiteten Plan erneut mit Dateilink zur Entscheidung vor. Wurde derselbe konkrete Plan im Gespräch bereits ausdrücklich freigegeben, nutze diese Freigabe ohne erneute Nachfrage.
- Decken neue Erkenntnisse notwendige wesentliche Abweichungen vom freigegebenen Umfang oder Ansatz auf, lege die Anpassung vor der davon betroffenen Implementierung erneut zur Freigabe vor. Routineentscheidungen innerhalb des freigegebenen Plans benötigen keine erneute Freigabe.

## Minimalen Produktionscode nach Planfreigabe implementieren

1. Wähle eine kleine zusammenhängende Gruppe fehlschlagender Szenarien und implementiere das dafür notwendige Verhalten in der zuständigen Produktionskomponente oder im zuständigen Service.
2. Nutze bestehende Architektur, Schnittstellen und Bibliotheken. Halte die Änderung lokal; ergänze keine spekulativen Funktionen, zusätzlichen Schichten oder beiläufigen Abhängigkeitsänderungen.
3. Implementiere das fachliche Verhalten für die vereinbarten Eingaben. Vermeide auf Testdaten zugeschnittene Sonderfälle, Testumgebungserkennung oder fest verdrahtete Antworten, die den tatsächlichen Ablauf umgehen. Mocke im Produktionscode keine zu implementierende Funktionalität.
4. Führe die betroffenen Tests nach jeder zusammenhängenden Änderung erneut aus, analysiere verbleibende Fehler und korrigiere die jeweilige Ursache. Wiederhole dies, bis die vorbereiteten Tests bestehen oder ein konkretes Hindernis weitere Arbeit verhindert.

Minimal bedeutet die kleinste korrekte Lösung innerhalb der bestehenden Projektregeln. Erhalte Typprüfung, Zugänglichkeit und erforderliches Lifecycle-Cleanup. Verschiebe größere Bereinigungen und Optimierungen in eine spätere Refactor-Phase.

## Tests bewahren

- Verändere weder Tests noch Fixtures, Mocks, Snapshots oder Runner-Konfiguration, um eine korrekte Erwartung an die Implementierung anzupassen. Schwäche Assertions nicht ab, lösche keine Fälle und nutze keine Ausschlüsse, `skip`, `pending`, `todo`, `test.fail()` oder ausschließlichen `only`-Läufe als Green-Nachweis.
- Korrigiere einen Test nur, wenn ein konkreter Testfehler belegt ist, etwa ein falscher Erwartungswert entgegen dem vereinbarten Vertrag, ein Tippfehler oder ein fehlerhaftes Setup. Dass der aktuelle Produktionscode abweicht oder die Umsetzung aufwendig ist, ist kein Beleg.
- Dokumentiere bei einer Korrektur den Fehler, den maßgeblichen Vertrag und die kleinste nötige Teständerung. Erhalte das fachliche Szenario und seine Aussagekraft; führe den korrigierten Test erneut aus. Kläre widersprüchliche oder unklare Erwartungen, statt sie eigenmächtig abzuschwächen.

## Green nachweisen und mit Refactor fortfahren

- Führe abschließend alle vorbereiteten Tests und die vollständige projektrelevante Testsuite aus, einschließlich der Regressionstests für berührte Funktionen. Ein gezielter Lauf während der Umsetzung ersetzt diesen Abschluss nicht. Beachte außerdem vorgeschriebene Build-, Typ- und Formatprüfungen; formatiere nur geänderte Dateien.
- In BookMonkey ist nach Anwendungscodeänderungen `npm run build` erforderlich. Nutze die projektspezifischen Playwright-Tests unter `tests/`; diese mocken die API und benötigen kein Backend. Lies bei Books-Tests auch `src/app/books/AGENTS.md`. Das Karma-Ziel `npm test` gilt laut Repository-Hinweisen als unvollständig; prüfe den aktuellen Stand, bevor du es als ausführbar behandelst. Externe Beispieltests sind kein Nachweis für BookMonkey; benenne ihren Ausschluss ausdrücklich.
- Behebe durch die Implementierung verursachte Regressionen. Bei bereits bestehenden oder umgebungsbedingten Fehlern dokumentiere Ursache und Auswirkung. Ändere keine fachlichen Erwartungen oder Testauswahl, um einen vollständig erfolgreichen Lauf vorzutäuschen.
- Prüfe den abschließenden Diff auf unnötige Produktionsänderungen und unbeabsichtigte Teständerungen. Berichte die implementierten Erwartungen und betroffenen Dateien, tatsächlich ausgeführte Befehle mit Ergebnissen sowie jede begründete Testkorrektur.
- Melde Green nur, wenn alle Tests im ausgewiesenen Prüfumfang erfolgreich durchgelaufen sind. Benenne nicht ausgeführte oder blockierte relevante Checks sowie verbleibende Fehler ausdrücklich; behaupte in diesem Fall keinen vollständigen Green-Abschluss.
- Setze nach erfolgreichem Green den verbindlichen Refactor-Schritt fort. Eine Green-Zusammenfassung allein beendet den Implementierungsauftrag nicht.
