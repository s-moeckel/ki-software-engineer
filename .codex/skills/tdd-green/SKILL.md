---
name: tdd-green
description: Plant in der TDD-Green-Phase die Umsetzung vorbereiteter, fehlschlagender Tests und legt den Plan dem Nutzer zur Entscheidung vor. Implementiert erst nach ausdrücklicher Planfreigabe den minimal notwendigen Produktionscode, bewahrt die Tests außer bei nachgewiesenen Testfehlern und weist Green durch erfolgreiche Testläufe nach. Nach der Red-Phase einsetzen, wenn die getestete Funktionalität implementiert werden soll.
---

# TDD: Green-Phase

Übernimm die vorbereiteten Tests, analysiere ihre Erwartungen und plane die Umsetzung. Lege den konkreten Plan dem Nutzer zur Entscheidung vor und beginne die Implementierung erst nach seiner ausdrücklichen Freigabe dieses Plans. Vervollständige anschließend den Red-Green-Zyklus mit dem kleinsten fachlich korrekten Produktionscode. Beende die Phase nach dem nachgewiesenen Green; starte keine eigenständige Refactor-Phase.

## Tests und Erwartungen übernehmen

- Nutze übergebene Testdateien, Testtitel, Fehlermeldungen und gegebenenfalls die Szenario-Zuordnung aus der Red-Phase. Eine bestimmte Übergabeform oder die Verfügbarkeit einer anderen Skill ist nicht erforderlich. Liegen nur Fehlermeldungen vor, suche die zugehörigen Tests im Repository.
- Lies die geltenden `AGENTS.md`-Dateien, relevante Anforderungen und API-Verträge, die betroffenen Tests samt Fixtures sowie den zugehörigen Produktionscode. Prüfe Testkonfiguration und Skripte am aktuellen Stand.
- Leite aus Setup, Aktion und Assertions das erwartete beobachtbare Verhalten ab. Ordne jedem fehlschlagenden Szenario die fehlende Funktion oder verletzte Regel zu; beachte auch Fehlerfälle und asynchrone Abläufe, soweit getestet oder vereinbart.
- Fehlen die Tests oder widersprechen sich Tests und vereinbarte Anforderungen, kläre gezielt die entscheidende Lücke. Erfinde keine fachlichen Regeln oder API-Verträge. Bearbeite unabhängige, eindeutige Szenarien weiter.
- Prüfe den bestehenden Arbeitsstand vor Änderungen. Bewahre vorbereitete, auch noch nicht versionierte Tests und sonstige Arbeiten des Entwicklers.

## Red reproduzieren und Ursache bestimmen

Führe die betroffenen Tests zunächst gezielt mit dem vorhandenen Runner aus. Unterscheide fehlendes Produktverhalten, fehlende produktive Schnittstellen, Testfehler und Infrastrukturprobleme. Ein fehlender Browser, defektes Setup oder nicht erreichbarer Dienst belegt kein fehlendes Feature.

Bereits grüne Tests benötigen keine zusätzliche Implementierung. Fehlende produktive Imports, Typen oder öffentliche Schnittstellen aus dem Testentwurf gehören zur Implementierung, sofern sie den vereinbarten Anforderungen entsprechen. Behandle sie nicht pauschal als fehlerhafte Tests.

## Umsetzungsplan vorlegen und Freigabe abwarten

- Erstelle auf Grundlage der Analyse und des Red-Nachweises einen konkreten, prüfbaren Plan: zu erfüllende Szenarien, betroffene Dateien und ihre geplanten Änderungen, wesentliche technische Entscheidungen sowie vorgesehene Tests und Build-Prüfungen. Benenne offene Entscheidungen und relevante Risiken; gib bei Alternativen eine begründete Empfehlung.
- Lege den Plan im Gespräch vor und bitte ausdrücklich um die Entscheidung des Nutzers: freigeben oder ändern. Beende diesen Schritt mit dem Hinweis, dass dieser Skill vor der Implementierung eine Planfreigabe verlangt, und verlinke diese `SKILL.md`.
- Warte auf die ausdrückliche Freigabe des vorgelegten Plans. Ein allgemeiner Implementierungsauftrag, der Skill-Aufruf oder ausbleibender Widerspruch gelten nicht als Planfreigabe. Bis dahin sind lesende Analyse und Testläufe erlaubt; ändere keinen Produktionscode, keine Tests, Fixtures, Abhängigkeiten oder Konfiguration und beginne keine Teilimplementierung.
- Arbeite Änderungswünsche in den Plan ein und lege den überarbeiteten Plan erneut zur Entscheidung vor. Wurde derselbe konkrete Plan im Gespräch bereits ausdrücklich freigegeben, nutze diese Freigabe ohne erneute Nachfrage.
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

## Green nachweisen und übergeben

- Führe abschließend alle vorbereiteten Tests und die vollständige projektrelevante Testsuite aus, einschließlich der Regressionstests für berührte Funktionen. Ein gezielter Lauf während der Umsetzung ersetzt diesen Abschluss nicht. Beachte außerdem vorgeschriebene Build-, Typ- und Formatprüfungen; formatiere nur geänderte Dateien.
- In BookMonkey ist nach Anwendungscodeänderungen `npm run build` erforderlich. Nutze die projektspezifischen Playwright-Tests unter `tests/`; diese mocken die API und benötigen kein Backend. Lies bei Books-Tests auch `src/app/books/AGENTS.md`. Das Karma-Ziel `npm test` gilt laut Repository-Hinweisen als unvollständig; prüfe den aktuellen Stand, bevor du es als ausführbar behandelst. Externe Beispieltests sind kein Nachweis für BookMonkey; benenne ihren Ausschluss ausdrücklich.
- Behebe durch die Implementierung verursachte Regressionen. Bei bereits bestehenden oder umgebungsbedingten Fehlern dokumentiere Ursache und Auswirkung. Ändere keine fachlichen Erwartungen oder Testauswahl, um einen vollständig erfolgreichen Lauf vorzutäuschen.
- Prüfe den abschließenden Diff auf unnötige Produktionsänderungen und unbeabsichtigte Teständerungen. Berichte die implementierten Erwartungen und betroffenen Dateien, tatsächlich ausgeführte Befehle mit Ergebnissen sowie jede begründete Testkorrektur.
- Melde Green nur, wenn alle Tests im ausgewiesenen Prüfumfang erfolgreich durchgelaufen sind. Benenne nicht ausgeführte oder blockierte relevante Checks sowie verbleibende Fehler ausdrücklich; behaupte in diesem Fall keinen vollständigen Green-Abschluss.
