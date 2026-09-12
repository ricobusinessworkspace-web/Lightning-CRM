# Lesevertrag: was Jarvis OS aus dem CRM lesen darf

Stand: 12.09.2026. Das ist die **ganze** Schnittstelle zwischen beiden Systemen.
Mehr Kopplung soll nicht entstehen.

## Die Grenze

- **Jarvis liest `crm_*`, schreibt nie hinein.**
- **Das CRM liest `core_*` nie und schreibt nie hinein.** Die Zieldaten liegen
  doppelt (siehe „Offene Übergabe" unten) — das ist bekannt und beabsichtigt,
  bis Jarvis umgestellt ist.
- Alle Objekte hier verlangen eine **Anmeldung** (`authenticated`). Die Sichten
  laufen mit `security_invoker = true`, greifen also mit den Rechten des
  Aufrufers auf die Grundtabellen zu. Ein nicht angemeldeter Zugriff liefert
  nichts — nicht etwa alles.

## Die fünf Objekte

| Objekt | Art | Gestalt | Wofür |
|---|---|---|---|
| `crm_daily_metrics` | Sicht | `metric_key, tag, wert` | Was an einem Tag passiert ist |
| `crm_stock_metrics` | Sicht | `metric_key, wert` | Wie es **jetzt** aussieht — ohne Datum |
| `crm_metric_targets` | Tabelle | `metric_key, label, base_value, target_value, comparator, sort_order, valid_from` | Soll und Basis, mit Historie |
| `crm_settings` | Tabelle | `key, value (jsonb), label` | Einstellungen, die beide Systeme teilen |
| `crm_pipeline_snapshots` | Tabelle | `tag` + Bestandsspalten | Verlauf des Bestands |

### Warum zwei Sichten und nicht eine

`crm_daily_metrics` enthält **Ereignisse** — ein Anruf, ein Stufenwechsel, ein
Abschluss haben einen Tag, an dem sie stattgefunden haben. Die Historie ist echt.

`crm_stock_metrics` enthält **Bestände** — „wie viele Leads liegen in der
Kaltkartei" ist eine Frage an jetzt. Diese Zahlen mit `tag = heute` in die
Tagessicht zu schreiben würde eine Historie vortäuschen, die es nicht gibt.
Für den Verlauf gibt es `crm_pipeline_snapshots`.

## Kennzahlen in `crm_daily_metrics`

Kein Eintrag an einem Tag heißt **null**, nicht „unbekannt" (wie `impliesZero`
in `core_metric_sources`).

### Ursachen — was getan wurde

| `metric_key` | Bedeutung |
|---|---|
| `sales.calls_count` | Alle Anrufe. Gewählt zählt, auch wenn niemand rangeht |
| `sales.calls_cold_gross` | Anrufe auf Leads, die **beim Wählen** auf `cold` standen und Großkunde waren |
| `sales.calls_cold_tarif` | dasselbe für Tarifkunden |
| `sales.calls_followup` | Anrufe auf Leads, die beim Wählen auf `pitch`, `data` oder `offer` standen |
| `sales.calls_first_contact` | Erster Anruf überhaupt bei diesem Lead |
| `sales.calls_morning_gross` | Großkunden-Kaltanrufe vor der Grenze aus `crm_settings → rhythm.morning_end` |
| `sales.calls_afternoon_tarif` | Tarif-Kaltanrufe ab dieser Grenze |
| `sales.calls_estimated` | **Wie viele der Anrufe dieses Tages eine genäherte Einordnung tragen** |

### Fortschritt — aus Stufenwechseln

| `metric_key` | Bedeutung |
|---|---|
| `sales.stage_cold_pitch` | Entscheider gesprochen |
| `sales.stage_pitch_data` | Daten bekommen |
| `sales.stage_data_offer` | Angebot raus |
| `sales.stage_offer_closed` | Abschluss |
| `sales.stage_regress` | Rückschritt: neue Stufe liegt vor der alten |

### Wirkung

| `metric_key` | Bedeutung |
|---|---|
| `sales.closed_count` | Abschlüsse, datiert über `crm_leads.closed_at_ms` |
| `sales.closed_value_eur` | Summe der erwarteten Provision dieser Abschlüsse |
| `sales.closed_without_value` | Abschlüsse an diesem Tag **ohne** eingetragenen Wert |

## Kennzahlen in `crm_stock_metrics`

| `metric_key` | Bedeutung |
|---|---|
| `sales.pipeline_count` | Leads auf `offer`, ohne aussortierte |
| `sales.pipeline_value_eur` | Summe der erwarteten Provision **der bewerteten** darunter |
| `sales.leads_without_value` | Leads in `pitch`/`data`/`offer` ohne Wert |
| `sales.overdue_followups` | Wiedervorlagen, deren Termin verstrichen ist |
| `sales.cold_stock` | Kaltkartei: `cold` mit Status „Lead" |
| `sales.cold_never_called` | davon nie angerufen |
| `sales.disqualified_total` | Status „Uninteressant", über alle Stufen |
| `sales.closed_total` | Abschlüsse insgesamt |
| `sales.closed_without_value_total` | davon ohne Wert |
| `sales.closed_without_date_total` | davon ohne Abschlussdatum |

## Drei Dinge, die man wissen muss, bevor man das auswertet

### 1. Die Anruf-Aufteilung ist für Altdaten genähert

Bis zum Umbau am 10.09.2026 trug ein Anruf seine Einordnung nicht selbst; sie
wurde aus dem **heutigen** Zustand des Leads abgeleitet. Alle 277 Altanrufe sind
deshalb über `sales.calls_estimated` als Näherung markiert.

Praktisch heißt das: Die Kaltakquise ist dort **unterschätzt**. Ein Lead, der
zehnmal kalt angerufen wurde und heute auf `pitch` steht, zählt zehnmal als
Nachgreifen.

`sales.calls_count` ist davon **nicht** betroffen — ein Anruf ist ein Anruf.

### 2. Conversion-Raten haben keine Vergangenheit

Stufenwechsel wurden vor dem Umbau nur als Fließtext und **ohne die alte Stufe**
protokolliert. Diese acht Altzeilen sind ausgefiltert.

Konsequenz: Die fünf `sales.stage_*`-Kennzahlen liefern zurzeit **überhaupt
keine Zeilen**. Sie sind nicht kaputt — es gibt noch nichts zu zählen. Der
Trichter füllt sich ab dem ersten Stufenwechsel nach dem Umbau.

### 3. 53 von 55 Abschlüssen haben kein Datum

Sie erscheinen deshalb in **keiner** Zeitreihe. Nur `sales.closed_total` und
`sales.closed_without_date_total` zeigen sie. Rico trägt sie von Hand nach; eine
Näherung wurde bewusst abgelehnt. Kein einziger Abschluss hat bisher einen Wert.

## Ziele lesen — `crm_metric_targets`

```
metric_key · label · base_value · target_value · comparator · sort_order · valid_from
```

`base_value` = schlechter Tag, zählt noch als erfüllt.
`target_value` = das eigentliche Soll.

**Es gilt die Zeile mit dem größten `valid_from`, das nicht nach dem Stichtag
liegt.** Eine Zieländerung legt eine neue Zeile an, statt die alte zu
überschreiben — sonst würde das Anheben eines Ziels die Vergangenheit
rückwirkend schlechter aussehen lassen.

Stand 12.09.2026, alle ab `2026-09-01`:

| `metric_key` | Basis | Soll |
|---|---|---|
| `sales.calls_count` | 30 | 100 |
| `sales.calls_cold_gross` | 10 | 40 |
| `sales.calls_cold_tarif` | 10 | 40 |
| `sales.calls_followup` | 10 | 20 |

Die Teilziele summieren sich auf das Gesamtziel: 10+10+10 = 30, 40+40+20 = 100.

**Zuordnung zu `core_intentions`:** `base_value` → `base_value`,
`target_value` → `stretch_value`. Andere Benennung, gleiche Bedeutung: 100
Anrufe sind kein optionales Dehnziel, sondern das Soll — daher `target`.

## Gemeinsame Einstellungen — `crm_settings`

| `key` | Wert | Wofür |
|---|---|---|
| `rhythm.morning_end` | `"12:00"` | Grenze Vormittag/Nachmittag |
| `block.start_date` | `"2026-09-01"` | Beginn von Block 1 |
| `block.weeks` | `12` | Länge eines Blocks |

**Die Blockrechnung muss in beiden Systemen dieselbe sein.** Zwei fest
verdrahtete Datumsangaben laufen garantiert auseinander. Im CRM steht sie in
`ccGrenzen` (`public/ui/pipeline_ui.js`) und rechnet in **Kalendertagen**, nicht
in Millisekunden — sonst verschiebt die Zeitumstellung Ende Oktober den
Blockbeginn um einen Tag. Prüfung 26 in `tests/ui.test.mjs` sichert das ab.

## Offene Übergabe an den Jarvis-Agenten

Drei Punkte, die auf Jarvis-Seite zu erledigen sind — **nicht** im CRM:

1. **`sales.calls_count` hat zwei Wahrheiten.** In `core_metric_sources` steht
   die Quelle `kind: 'crm_calls'` mit `{userName: "Rico", impliesZero: true}` —
   sie zählt die Rohtabelle. Besser ist `crm_daily_metrics`: dort ist die
   Einordnung eingefroren und die Abfrage nicht gedeckelt.

2. **Die Ziele liegen doppelt.** `core_intentions` trägt für
   `sales.calls_count` noch **Basis 30 / Stretch 60**, `crm_metric_targets`
   trägt **30 / 100**. Solange beides existiert, hängt es von der Leseseite ab,
   welche Zahl gilt. Das CRM soll die Quelle sein.

3. **Für die neuen Kennzahlen fehlen die Definitionen.** In
   `core_metric_definitions` steht bisher nur `sales.calls_count`.

## Grenzen des Vertrags

- **Einzelplatz-Betrieb.** Die Sichten fassen **alle** Anrufe zusammen, ohne
  nach Nutzer zu trennen. Ein Altanruf steht auf dem Fremdkonto
  `alan.niklas11` und zählt mit. Bei Team-Betrieb braucht es eine Sicht je
  Nutzer.
- **Keine realisierte Provision.** Das CRM kennt nur den **erwarteten** Wert am
  Abschlusstag. Was tatsächlich ankommt, gehört in den Finance-Bereich von
  Jarvis. Der Abstand zwischen beiden ist später die Storno-Quote — deshalb
  müssen es zwei getrennte Zahlen bleiben und nicht eine, die überschrieben
  wird.
- **Keine Auszahlungslogik.** Vorabprovision, Tranchen, Fälligkeiten: alles
  Jarvis. Das CRM ordnet den vollen erwarteten Wert dem Abschlusstag zu.
