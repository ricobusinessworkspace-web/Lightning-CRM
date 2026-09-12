/**
 * api/_lib/mcp_werkzeuge.js — was der MCP-Server kann
 * ─────────────────────────────────────────────────────────────────────────────
 * Jedes Werkzeug beschreibt sich selbst (Name, Zweck, erwartete Angaben) und
 * bringt seine Ausführung mit. Die Beschreibungen liest das Sprachmodell — sie
 * sind deshalb in ganzen Sätzen und sagen auch, wann man etwas NICHT nimmt.
 */
import {
  supabase, fehler, leadHolen, leadSchreiben,
  aufgabenLesen, aufgabenSchreiben, neueAufgabenId,
  aktivitaetFesthalten, anrufFesthalten, STUFEN
} from './crm.js';

const LISTEN_SPALTEN =
  'id, name, phone, email, website_url, maps_city, stage, status, size, ' +
  'starred, task_text, notes, snooze_until_ms, last_contact_ms, last_edited_ms';

const STUFEN_TEXT = {
  cold: 'Kaltakquise', pitch: 'Erstgespräch', data: 'Daten erhalten',
  offer: 'Angebot draußen', closed: 'Abgeschlossen'
};

/** Ein Lead in der knappen Form, die in einer Liste steht. */
function kurz(l) {
  const aufgaben = aufgabenLesen(l.task_text);
  const offen = aufgaben.filter(a => !a.done);
  return {
    id: l.id,
    name: l.name,
    stufe: l.stage,
    stufe_text: STUFEN_TEXT[l.stage] || l.stage,
    zustand: l.status,
    telefon: l.phone || null,
    email: l.email || null,
    ort: l.maps_city || null,
    website: l.website_url || null,
    groesse: l.size || null,
    priorisiert: !!l.starred,
    offene_aufgaben: offen.length,
    offene_aufgaben_texte: offen.slice(0, 5).map(a => a.text),
    wiedervorlage: l.snooze_until_ms > Date.now() ? new Date(l.snooze_until_ms).toISOString() : null,
    letzter_kontakt: l.last_contact_ms ? new Date(l.last_contact_ms).toISOString() : null,
    stand: l.last_edited_ms || 0
  };
}

export const WERKZEUGE = [
  {
    name: 'leads_suchen',
    title: 'Leads suchen',
    description:
      'Durchsucht die Leads des CRM und gibt eine Liste zurück. Ohne Angaben kommen ' +
      'die zuletzt bearbeiteten Leads. Für einen einzelnen Lead mit Verlauf und allen ' +
      'Aufgaben ist "lead_anzeigen" die bessere Wahl.',
    inputSchema: {
      type: 'object',
      properties: {
        suche: { type: 'string', description: 'Teil des Firmennamens.' },
        stufe: { type: 'string', enum: STUFEN, description: 'Nur Leads auf dieser Pipeline-Stufe.' },
        zustand: { type: 'string', enum: ['Lead', 'Kunde', 'Uninteressant'], description: 'Standard: alles außer Uninteressant.' },
        nur_mit_offenen_aufgaben: { type: 'boolean', description: 'Nur Leads, an denen noch etwas offen ist.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Höchstzahl der Treffer, Standard 25.' }
      },
      additionalProperties: false
    },
    async run(a = {}) {
      const limit = Math.min(Math.max(a.limit || 25, 1), 100);
      let q = supabase().from('crm_leads').select(LISTEN_SPALTEN);

      if (a.zustand) q = q.eq('status', a.zustand);
      else q = q.neq('status', 'Uninteressant');

      if (a.stufe) q = q.eq('stage', a.stufe);
      if (a.suche) q = q.ilike('name', `%${a.suche}%`);

      // Bei einem Filter auf offene Aufgaben muss mehr geladen werden, weil die
      // Aufgaben als Text in der Spalte stehen und die Datenbank nicht hineinsieht.
      q = q.order('last_edited_ms', { ascending: false })
           .limit(a.nur_mit_offenen_aufgaben ? 500 : limit);

      const { data, error } = await q;
      if (error) throw fehler(error.message, 500);

      let treffer = (data || []).map(kurz);
      if (a.nur_mit_offenen_aufgaben) treffer = treffer.filter(l => l.offene_aufgaben > 0);
      return { anzahl: treffer.length, leads: treffer.slice(0, limit) };
    }
  },

  {
    name: 'lead_anzeigen',
    title: 'Lead anzeigen',
    description:
      'Zeigt einen Lead vollständig: Stammdaten, Notizen, alle Aufgaben (offene und ' +
      'erledigte) und den Verlauf aus Anrufen, Nachrichten und Stufenwechseln. ' +
      'Das Feld "stand" aus der Antwort braucht man, um später gefahrlos zu schreiben.',
    inputSchema: {
      type: 'object',
      properties: { lead_id: { type: 'integer', description: 'Nummer des Leads.' } },
      required: ['lead_id'],
      additionalProperties: false
    },
    async run({ lead_id }) {
      const l = await leadHolen(lead_id, true);
      const anrufe = (l.crm_calls || []).map(c => ({
        art: 'Anruf', zeitpunkt: new Date(c.ts).toISOString(),
        stufe_damals: c.stage_at_call || null, durch: c.by_user_name || null
      }));
      const weitere = (l.lead_activities || []).map(x => ({
        art: x.type, zeitpunkt: new Date(x.ts).toISOString(),
        text: x.details || null, durch: x.by_user_name || null
      }));
      const verlauf = [...anrufe, ...weitere]
        .sort((a, b) => (a.zeitpunkt < b.zeitpunkt ? 1 : -1))
        .slice(0, 50);

      const aufgaben = aufgabenLesen(l.task_text).map(t => ({
        id: t.id, text: t.text, erledigt: !!t.done,
        erledigt_am: t.done_ms ? new Date(t.done_ms).toISOString() : null,
        faellig: t.deadline || null,
        teilaufgaben: (t.subtasks || []).map(s => ({ id: s.id, text: s.text, erledigt: !!s.done }))
      }));

      return {
        ...kurz(l),
        notizen: l.notes || '',
        umsatz: l.umsatz || 0,
        aufgaben,
        anrufe_gesamt: anrufe.length,
        verlauf
      };
    }
  },

  {
    name: 'notiz_anhaengen',
    title: 'Notiz anhängen',
    description:
      'Hängt einen Absatz mit Datum an die Notizen eines Leads an. Bestehende Notizen ' +
      'bleiben stehen — es wird nie überschrieben. Für etwas, das noch zu tun ist, ' +
      'ist "aufgabe_anlegen" richtig, nicht eine Notiz.',
    inputSchema: {
      type: 'object',
      properties: {
        lead_id: { type: 'integer' },
        text: { type: 'string', minLength: 1, description: 'Was festgehalten werden soll.' }
      },
      required: ['lead_id', 'text'],
      additionalProperties: false
    },
    async run({ lead_id, text }) {
      const l = await leadHolen(lead_id);
      const datum = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const bisher = (l.notes || '').trimEnd();
      const neu = (bisher ? bisher + '\n\n' : '') + `[${datum}] ${text.trim()}`;
      await leadSchreiben(lead_id, { notes: neu }, { erwarteterStand: l.last_edited_ms });
      return { ok: true, notizen: neu };
    }
  },

  {
    name: 'aufgabe_anlegen',
    title: 'Aufgabe anlegen',
    description:
      'Legt am Lead eine offene Aufgabe an. Sie taucht danach im Aufgabenreiter der ' +
      'App auf. Bestehende Aufgaben bleiben unverändert.',
    inputSchema: {
      type: 'object',
      properties: {
        lead_id: { type: 'integer' },
        text: { type: 'string', minLength: 1, description: 'Was zu tun ist, in einem Satz.' },
        faellig: { type: 'string', description: 'Datum als JJJJ-MM-TT. Weglassen, wenn es kein Datum gibt.' }
      },
      required: ['lead_id', 'text'],
      additionalProperties: false
    },
    async run({ lead_id, text, faellig }) {
      if (faellig && !/^\d{4}-\d{2}-\d{2}$/.test(faellig)) {
        throw fehler('Das Datum muss die Form JJJJ-MM-TT haben.');
      }
      const l = await leadHolen(lead_id);
      const liste = aufgabenLesen(l.task_text);
      const aufgabe = { id: neueAufgabenId(), text: text.trim(), done: false, deadline: faellig || '', subtasks: [] };
      liste.push(aufgabe);
      await leadSchreiben(lead_id, { task_text: aufgabenSchreiben(liste) }, { erwarteterStand: l.last_edited_ms });
      return { ok: true, aufgabe_id: aufgabe.id, offene_aufgaben: liste.filter(t => !t.done).length };
    }
  },

  {
    name: 'aufgabe_abhaken',
    title: 'Aufgabe abhaken',
    description:
      'Setzt eine Aufgabe auf erledigt. Sie wird nicht gelöscht, sondern bleibt mit ' +
      'Zeitpunkt in der Historie des Leads stehen. Die Nummer der Aufgabe steht in ' +
      'der Antwort von "lead_anzeigen".',
    inputSchema: {
      type: 'object',
      properties: { lead_id: { type: 'integer' }, aufgabe_id: { type: 'integer' } },
      required: ['lead_id', 'aufgabe_id'],
      additionalProperties: false
    },
    async run({ lead_id, aufgabe_id }) {
      const l = await leadHolen(lead_id);
      const liste = aufgabenLesen(l.task_text);
      const treffer = liste.find(t => t.id === aufgabe_id);
      if (!treffer) throw fehler(`Der Lead hat keine Aufgabe mit der Nummer ${aufgabe_id}.`, 404);
      if (treffer.done) return { ok: true, hinweis: 'Die Aufgabe war bereits erledigt.' };

      treffer.done = true;
      treffer.done_ms = Date.now();
      await leadSchreiben(lead_id, { task_text: aufgabenSchreiben(liste) }, { erwarteterStand: l.last_edited_ms });
      await aktivitaetFesthalten(lead_id, 'task_done', `Aufgabe erledigt: ${treffer.text}`);
      return { ok: true, offene_aufgaben: liste.filter(t => !t.done).length };
    }
  },

  {
    name: 'stufe_setzen',
    title: 'Pipeline-Stufe setzen',
    description:
      'Setzt den Lead auf genau diese Stufe: cold (Kaltakquise), pitch (Erstgespräch), ' +
      'data (Daten erhalten), offer (Angebot draußen), closed (abgeschlossen). Der ' +
      'Wechsel wird im Verlauf mit alter und neuer Stufe festgehalten. Ein Abschluss ' +
      'bekommt beim ersten Mal ein Datum, das später nicht mehr wandert. ' +
      'Beim Abschluss können "wert" (erwartete Provision in Euro) und "datum" ' +
      'gleich mitgegeben werden. Fehlen sie, wird der Abschluss trotzdem gesetzt ' +
      'und die Antwort weist darauf hin — erzwungen wird nichts.',
    inputSchema: {
      type: 'object',
      properties: {
        lead_id: { type: 'integer' },
        stufe: { type: 'string', enum: STUFEN },
        wert: {
          type: 'number', minimum: 0,
          description: 'Erwartete Provision in Euro. Nur beim Abschluss sinnvoll. ' +
                       'Weglassen heißt "noch nicht bekannt" — 0 heißt "tatsächlich null Euro".'
        },
        datum: {
          type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          description: 'Abschlussdatum als JJJJ-MM-TT. Ohne Angabe zählt der heutige Tag.'
        }
      },
      required: ['lead_id', 'stufe'],
      additionalProperties: false
    },
    async run({ lead_id, stufe, wert, datum }) {
      const l = await leadHolen(lead_id);
      if (l.stage === stufe) return { ok: true, hinweis: `Der Lead steht bereits auf ${stufe}.` };

      const felder = { stage: stufe };
      if (stufe === 'closed') {
        if (wert !== undefined) felder.provi_umsatz = wert;
        // Mittags statt Mitternacht, damit der Tag beim Umrechnen nicht ueber
        // eine Zeitzonengrenze auf den Vortag kippt.
        if (datum) felder.closed_at_ms = new Date(`${datum}T12:00:00`).getTime();
      }

      await leadSchreiben(lead_id, felder, { erwarteterStand: l.last_edited_ms });

      const antwort = { ok: true, vorher: l.stage, jetzt: stufe };
      // Der eigentliche Zweck: beim Abschluss nach dem Wert fragen, statt ihn
      // stillschweigend fehlen zu lassen. Stand 12.09.2026 hatten 55 von 55
      // Abschluessen keinen Wert.
      if (stufe === 'closed' && felder.provi_umsatz === undefined
          && (l.provi_umsatz === null || l.provi_umsatz === undefined)) {
        antwort.hinweis = 'Abschluss ohne Wert. Wenn die erwartete Provision bekannt ist, ' +
                          'noch einmal mit "wert" aufrufen — sonst bleibt der Abschluss ' +
                          'in der Liste "Abschlüsse ohne Wert" stehen.';
      }
      return antwort;
    }
  },

  {
    name: 'anruf_festhalten',
    title: 'Anruf festhalten',
    description:
      'Hält fest, dass mit dem Lead telefoniert wurde. Das CRM unterscheidet bewusst ' +
      'nicht zwischen erreicht und nicht erreicht — ein Anruf ist ein Anruf. Zählt in ' +
      'die Tagesstatistik.',
    inputSchema: {
      type: 'object',
      properties: { lead_id: { type: 'integer' } },
      required: ['lead_id'],
      additionalProperties: false
    },
    async run({ lead_id }) {
      const ts = await anrufFesthalten(lead_id);
      return { ok: true, zeitpunkt: new Date(ts).toISOString() };
    }
  },

  {
    name: 'nachricht_festhalten',
    title: 'Nachricht festhalten',
    description:
      'Hält fest, dass dem Lead geschrieben wurde. E-Mail und WhatsApp sind im CRM ' +
      'dieselbe Aktivität; der Weg steht im Verlaufstext.',
    inputSchema: {
      type: 'object',
      properties: {
        lead_id: { type: 'integer' },
        weg: { type: 'string', enum: ['email', 'whatsapp'], description: 'Standard: email.' }
      },
      required: ['lead_id'],
      additionalProperties: false
    },
    async run({ lead_id, weg = 'email' }) {
      await leadHolen(lead_id);
      const text = weg === 'whatsapp' ? 'WhatsApp geschrieben' : 'E-Mail geschrieben';
      await aktivitaetFesthalten(lead_id, 'message', text);
      await supabase().from('crm_leads').update({ last_contact_ms: Date.now() }).eq('id', lead_id);
      return { ok: true, festgehalten: text };
    }
  },

  {
    name: 'kennzahlen',
    title: 'Kennzahlen',
    description:
      'Zählt den Bestand: wie viele Leads auf welcher Stufe stehen, wie viele Kunden ' +
      'es gibt, wie viele Anrufe heute und diese Woche geführt wurden und an wie vielen ' +
      'Leads noch etwas offen ist.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async run() {
      const db = supabase();
      const { data: leads, error } = await db
        .from('crm_leads').select('stage, status, task_text').limit(5000);
      if (error) throw fehler(error.message, 500);

      const proStufe = {};
      for (const s of STUFEN) proStufe[s] = 0;
      let kunden = 0, ausgeschlossen = 0, mitOffenen = 0;

      for (const l of leads || []) {
        if (l.status === 'Kunde') kunden++;
        else if (l.status === 'Uninteressant') { ausgeschlossen++; continue; }
        if (l.stage in proStufe) proStufe[l.stage]++;
        if (aufgabenLesen(l.task_text).some(t => !t.done)) mitOffenen++;
      }

      const jetzt = new Date();
      const tagesbeginn = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate()).getTime();
      const wochentag = jetzt.getDay();
      const wochenbeginn = new Date(
        jetzt.getFullYear(), jetzt.getMonth(),
        jetzt.getDate() - wochentag + (wochentag === 0 ? -6 : 1)
      ).getTime();

      const zaehle = async (ab) => {
        const { count } = await db.from('crm_calls')
          .select('id', { count: 'exact', head: true }).gte('ts', ab);
        return count || 0;
      };

      return {
        leads_gesamt: (leads || []).length - ausgeschlossen,
        kunden,
        ausgeschlossen,
        pro_stufe: proStufe,
        leads_mit_offenen_aufgaben: mitOffenen,
        anrufe_heute: await zaehle(tagesbeginn),
        anrufe_diese_woche: await zaehle(wochenbeginn),
        hinweis: (leads || []).length >= 5000
          ? 'Der Bestand ist an die Ladegrenze von 5000 Zeilen gestoßen — die Zahlen sind unvollständig.'
          : undefined
      };
    }
  }
];

export const NACH_NAME = Object.fromEntries(WERKZEUGE.map(w => [w.name, w]));
