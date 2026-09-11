# Wohin das geht

*Stand 12.09.2026. Kein Zustand — dafür ist das Handover da. Hier steht die
Richtung und was in welcher Reihenfolge dafür passieren muss.*

---

## Was sich gerade geändert hat

Die Vision im Handover lautet: *„Robustes, verlässliches Einzelplatz-CRM, das
bei Bedarf ohne Codeänderung auf Team-Betrieb umschaltet."* Das stimmt weiter,
greift aber zu kurz. Zwei Dinge sind seither dazugekommen:

**1. Das CRM hat jetzt zwei Bedienoberflächen.** Die App im Browser — und
Claude über den MCP-Server. Das ist kein Zusatzfeature, das verändert, was
„fertig" heißt. Jede neue Funktion muss ab jetzt zweimal gedacht werden: wie
bedient man sie, und wie ruft man sie auf. Wo das auseinanderläuft, entstehen
genau die stillen Fehler, gegen die dieses Projekt seit Monaten kämpft.

**2. Aus dem Karteikasten wird ein Disziplin-System.** `crm_metric_targets`
enthält Tagesziele — 100 Anrufe, aufgeteilt in Cold Großkunden, Cold Tarif und
Nachgreifen, von 30 aus hochgezogen. Ein CRM beantwortet „wo steht dieser
Lead?". Ein Disziplin-System beantwortet „habe ich heute die Arbeit gemacht,
aus der Abschlüsse entstehen?". Das ist die wichtigere Frage, und die Technik
muss ihr folgen.

**Die Vision, neu gefasst:**

> Ein Werkzeug, das die tägliche Vertriebsarbeit trägt statt sie zu
> verwalten — bedienbar über die App *und* über Claude, ehrlich in jeder Zahl,
> und ohne Umbau auf mehrere Leute erweiterbar.

---

## Wo du wirklich stehst

| | |
|---|---|
| Leads | 195 aktiv, 55 Kunden, 30 ausgeschlossen |
| Verteilung | 83 cold · 41 pitch · 12 data · 4 offer · 55 closed |
| Leads mit offener Aufgabe | 8 |
| Anrufe diese Woche | 23 |
| Tagesziel laut `crm_metric_targets` | 30 → 100 |

**Das Wichtigste an dieser Tabelle steht in den letzten zwei Zeilen.** Die
Software ist der Nutzung voraus. 23 Anrufe in einer Woche gegen ein Ziel von
30 am Tag heißt: der Engpass ist nicht, was das CRM kann. Er liegt davor.

Daraus folgt die Reihenfolge weiter unten. Alles, was Reibung aus dem täglichen
Ablauf nimmt, steht vorn. Alles, was nur Fähigkeiten hinzufügt, steht hinten —
egal wie reizvoll es ist.

Zwei weitere Zahlen, die dasselbe sagen: nur **8 von 195 Leads** haben eine
offene Aufgabe. Und **41 Leads stehen auf `pitch`** — einmal gesprochen, dann
nichts mehr. Das ist kein Datenproblem, das ist ein Nachfass-Problem, und
genau dafür gibt es Wiedervorlage und Aufgaben. Sie werden nur kaum benutzt.

---

## Phase 0 — Das, was brennt

**Zeitrahmen: diese Woche. Alles andere wartet.**

### 0.1 Google-Schlüssel sperren — nur du kannst das

In der Google Cloud Console sperren, neuen anlegen, auf die benötigte
Schnittstelle und die Adresse der App einschränken. Aus dem Code ist er raus,
aus der Versionsgeschichte eines öffentlichen Repositories bekommt ihn niemand
mehr heraus. **Solange das nicht passiert ist, ist jede andere Arbeit an
Sicherheit Kosmetik.**

### 0.2 Entscheiden, ob das Repository öffentlich bleibt

Es ist heute öffentlich. Das war vermutlich nie eine Entscheidung, sondern die
Voreinstellung. Ein privates Repository nimmt einen ganzen Bedrohungspfad weg —
und kostet nichts, weil hier niemand mitliest.

### 0.3 Die neun ungeschützten Tabellen

Siehe [ungeschuetzte-tabellen.md](ungeschuetzte-tabellen.md). Nicht CRM, aber
dieselbe Datenbank und derselbe öffentliche Schlüssel. Eine Tabelle zur Probe,
Jarvis gegenprüfen, dann die übrigen acht.

### 0.4 Eine Sicherung, die nicht bei Supabase liegt

Heute gibt es keine. Kein Export aus der App, keine zweite Kopie. Ein Fehlgriff
in `admin_scripts/` — die schreiben direkt auf die produktive Datenbank — und
195 Leads und 277 Anrufe sind weg.

Der schnellste ehrliche Weg: ein Werkzeug `export_alles` am MCP-Server, das den
Bestand als JSON zurückgibt, plus ein kleines Skript, das das wöchentlich in
einen Ordner schreibt. Papaparse liegt ohnehin schon für CSV bereit.
**Aufwand: ein halber Tag. Der beste Gegenwert im ganzen Plan.**

---

## Phase 1 — Zahlen, die nicht lügen

*Voraussetzung dafür, dass das Disziplin-System überhaupt etwas taugt.*

### 1.1 Das echte Schema versioniert ablegen

`scratch/schema.sql` ist veraltet und nicht eingecheckt. Ein Abzug des echten
Schemas nach `docs/schema.sql`, bei jeder Änderung erneuert. Zehn Minuten,
verhindert dauerhaft die Falle, die schon zweimal Zeit gekostet hat.

### 1.2 `crm_calls.by_user_id` auf `uuid` mit Fremdschlüssel

Heute `text` ohne Fremdschlüssel. Bei 277 Zeilen ist die Umstellung billig. Im
Team-Betrieb ist sie es nicht mehr — und bis dahin kann jede Auswertung nach
Nutzer still danebenliegen.

### 1.3 Die Anrufqualität mitzählen, nicht nur die Menge

Die Kennzahl-Ziele unterscheiden bereits Cold Großkunden, Cold Tarif und
Nachgreifen. `crm_calls` hält dafür schon `stage_at_call` und `size_at_call`
fest — aber erst seit kurzem. Ältere Zeilen haben das nicht.

Das ist der Punkt, an dem sich entscheidet, ob aus den Zielen eine Auswertung
wird: *„von 100 Anrufen führten 12 zu einem Termin"* ist eine Aussage, mit der
man etwas anfangen kann. *„100 Anrufe"* allein nicht.

---

## Phase 2 — Der tägliche Kreis

*Hier liegt der eigentliche Hebel. Siehe die Zahlen oben.*

### 2.1 Der Morgen: eine Liste, keine Suche

Heute öffnest du das CRM und siehst Reiter. Was fehlt, ist die Antwort auf
*„wen rufe ich jetzt an?"* — eine Liste, die Wiedervorlagen, offene Aufgaben
und Leads ohne Kontakt seit X Tagen zusammenführt und nach Dringlichkeit
ordnet. Die Daten sind alle da.

Über den MCP-Server geht das sofort: *„Was steht heute an?"* Ein Werkzeug
`tagesliste` fällt dabei fast von selbst ab.

### 2.2 Der Abend: festhalten ohne Formular

Anrufe werden heute in der App festgehalten. Nach einem Tag am Telefon ist das
die Stelle, an der Disziplin bricht. Über Claude reicht ein Satz:
*„Bäckerei Klein angerufen, Termin nächste Woche, Stufe auf data."* Drei
Werkzeuge in einem Aufruf — die gibt es schon, sie müssen nur zusammenfinden.

### 2.3 Das Nachfass-Loch schließen

41 Leads auf `pitch`, 8 mit offener Aufgabe. Wer auf `pitch` wandert und keine
Wiedervorlage bekommt, fällt durch. Ein Vorschlag beim Stufenwechsel — nicht
erzwungen, nur vorgeschlagen — schließt das, ohne jemanden zu gängeln.

**Diese drei Punkte zusammen sind mehr wert als alles in Phase 3.**

---

## Phase 3 — Die Bauschulden

*Kein Risiko. Aber jede Änderung wird teurer, solange sie stehen.*

### 3.1 `pipeline_ui.js` aufteilen

2893 Zeilen, **eine** Abschnittsüberschrift, zusammen mit `main_ui.js` 142 von
152 globalen Funktionen. Liste / Seitenleiste / Karte / Dashboard sind vier
Themen in einer Datei.

Die Ladereihenfolge steht ausgeschrieben in `index.html` — das Aufteilen ist
mechanisch, nicht riskant. **Vorher die Testabdeckung ausweiten**, sonst merkt
man einen Fehler erst im Betrieb.

### 3.2 Die eingebauten Stile herauslösen

Rund 280 `style="..."` in den Vorlagen. Sinnvoll nur zusammen mit 3.1 — beides
fasst dieselben Zeilen an.

### 3.3 Cache-Marker automatisieren

Die `?v=`-Anhängsel werden von Hand gepflegt. Ich bin selbst hineingelaufen.
Ein Prüfschritt, der beim Testlauf meckert, wenn eine geänderte Datei ihren
Marker behalten hat, kostet eine Stunde.

---

## Phase 4 — Team-Betrieb

*Der Schalter steht bereit. Aber er darf erst umgelegt werden, wenn vier Dinge
stimmen.*

1. **Zugriffsregeln schärfen.** `auth_full_access` auf `crm_leads` erlaubt
   jedem Angemeldeten alles — und angemeldet wird man in jeder App dieses
   Supabase-Projekts. Mit dem ersten fremden Konto ist das ein echtes Loch.
2. **`getAgentStats` auf eine Datenbank-Auswertung umstellen.** Läuft nur im
   Team-Betrieb, holt dort aber drei Tabellen ungefiltert. Meldet inzwischen
   selbst, wenn es an die Grenze stößt — ein Hinweis ist aber kein Ersatz.
3. **VAPID-Schlüssel bei Vercel setzen**, sonst bleibt der Sales-Bell-Push aus.
4. **`SUPABASE_SERVICE_ROLE_KEY` ist gesetzt** ✓ — damit funktionieren
   Einladungen inzwischen überhaupt erst. Bis zum 11.09. hätten sie mit einem
   Fehler geantwortet.

Vollständige Liste: [multi-user-aktivieren.md](multi-user-aktivieren.md).

---

## Was bewusst nicht auf dieser Liste steht

- **Ein zweites Dashboard.** Es gibt eins, es liest aus den Sichten, es reicht.
- **Mehr Werkzeuge am MCP-Server.** Neun sind genug, bis die neun benutzt sind.
- **Eine mobile App.** Das CRM ist eine PWA und läuft auf dem Handy.
- **KI-Funktionen im CRM.** Die sitzen jetzt außen, über den MCP-Server. Das
  ist die bessere Stelle: kein Modell-Code in der Anwendung, keine Schlüssel im
  Browser, austauschbar.

---

## Die kürzeste ehrliche Fassung

1. Diese Woche: **Schlüssel sperren, Sicherung bauen.**
2. Danach: **Zahlen ehrlich machen** — Schema, Spaltentyp, Anrufqualität.
3. Dann: **den Tag tragen** — Morgenliste, Abend-Festhalten, Nachfass-Lücke.
4. Wenn das steht: **aufräumen**, damit es weiter billig bleibt.
5. Erst dann: **Team.**

Der Engpass ist heute nicht die Software. Er ist der Weg von 23 Anrufen die
Woche zu dem, was in `crm_metric_targets` steht. Punkt 3 zahlt darauf ein.
Alles andere sorgt dafür, dass nichts dabei kaputtgeht.
