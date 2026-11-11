# Virtual Library – Abnahmeprotokoll

Die erste Lieferung verwendet die feste Raum- und Buchgeometrie aus Issue 14. Die Positionen werden aus Autor, Titel und ISBN deterministisch berechnet; die Suche filtert nur die HTML-Liste und verändert die Positionen nicht.

## Browser-Untergrenzen

- Chrome: 157.0.8103.50
- Edge: 157.0.4341.42
- Firefox: bei Umsetzungsbeginn lokal nicht installiert; Versionsnummer vor der funktionalen Abnahme ergänzen

## Noch auszuführende Abnahmen

Die folgende Messung ist auf dem in Issue 14 festgelegten Snapdragon-X1E-Referenzrechner bei 1920 × 1080 mit Chrome 157 und aktivierter Hardwarebeschleunigung auszuführen: 10 Sekunden Aufwärmen, danach 60 Sekunden festgelegter Rundgang, Ziel 60 FPS und mindestens 95 % der Frames mit höchstens 33 ms.

Für zehn Öffnen-/Schließen-Zyklen sind Renderer, AnimationLoop, Pointer Lock, Event-Listener und Speicherverlauf im Browser zu prüfen. Diese Messungen werden nicht durch den Quellcode-Testlauf ersetzt.

