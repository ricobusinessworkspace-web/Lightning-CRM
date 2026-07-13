const https = require('https');

const NOTION_TOKEN = process.env.NOTION_TOKEN || ''; 
const PAGE_ID = process.env.PAGE_ID || '';           

if (!NOTION_TOKEN || !PAGE_ID) {
  console.error("❌ FEHLER: Bitte gib deinen Notion Token und die Page ID an.");
  console.error("Benutzung: NOTION_TOKEN='secret_...' PAGE_ID='123...' node setup-notion.js");
  process.exit(1);
}

function notionRequest(path, method, data) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.notion.com',
      path: '/v1' + path,
      method: method,
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 400) {
            reject(new Error(`Notion Error: ${json.message || body}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', e => reject(e));
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function setupDashboard() {
  console.log("🚀 Starte Notion Jarvis-Dashboard Setup...\n");

  try {
    // 1. Create Main Dashboard Page
    console.log("1️⃣  Erstelle Jarvis Haupt-Dashboard...");
    const dashboard = await notionRequest('/pages', 'POST', {
      parent: { page_id: PAGE_ID },
      icon: { type: "emoji", emoji: "🧠" },
      cover: { type: "external", external: { url: "https://images.unsplash.com/photo-1614729939124-032f0b56c9ce?q=80&w=2000" } },
      properties: {
        title: { title: [{ text: { content: "Jarvis Central Hub" } }] }
      }
    });
    const dashboardId = dashboard.id;
    console.log("   ✅ Dashboard erstellt!");

    // 2. Create Tasks Database
    console.log("2️⃣  Erstelle Daily Tasks Datenbank...");
    const tasksDb = await notionRequest('/databases', 'POST', {
      parent: { page_id: dashboardId },
      title: [{ text: { content: "Daily Tasks & Pipeline" } }],
      icon: { type: "emoji", emoji: "🎯" },
      properties: {
        "Name": { title: {} },
        "Status": { select: { options: [{ name: "To Do", color: "red" }, { name: "In Progress", color: "blue" }, { name: "Done", color: "green" }] } },
        "Date": { date: {} },
        "Priorität": { select: { options: [{ name: "High", color: "red" }, { name: "Medium", color: "yellow" }, { name: "Low", color: "gray" }] } }
      }
    });
    console.log("   ✅ Tasks Datenbank erstellt.");

    // 3. Create Routines Database
    console.log("3️⃣  Erstelle Morning & Evening Routine Datenbank...");
    const routineDb = await notionRequest('/databases', 'POST', {
      parent: { page_id: dashboardId },
      title: [{ text: { content: "Habits & Routines" } }],
      icon: { type: "emoji", emoji: "🌅" },
      properties: {
        "Tag": { title: {} },
        "Date": { date: {} },
        "Morning Routine": { checkbox: {} },
        "Workout": { checkbox: {} },
        "Evening Routine": { checkbox: {} },
        "Energy Level": { select: { options: [{name: "Low", color:"red"}, {name: "Medium", color:"yellow"}, {name: "High", color:"green"}] } }
      }
    });
    console.log("   ✅ Routines Datenbank erstellt.");

    // 4. Create Revenue Database
    console.log("4️⃣  Erstelle Umsatz-Ziel Tracker...");
    const revDb = await notionRequest('/databases', 'POST', {
      parent: { page_id: dashboardId },
      title: [{ text: { content: "Umsatz & KPIs" } }],
      icon: { type: "emoji", emoji: "💰" },
      properties: {
        "Monat/Woche": { title: {} },
        "Ziel (EUR)": { number: { format: "euro" } },
        "Ist-Umsatz (EUR)": { number: { format: "euro" } },
        "Status": { select: { options: [{name: "On Track", color:"green"}, {name: "Behind", color:"red"}] } }
      }
    });
    console.log("   ✅ Umsatz Tracker erstellt.");

    console.log("\n🎉 SETUP ABGESCHLOSSEN!");
    console.log("👉 Gehe zu Notion und öffne dein neues Dashboard: " + dashboard.url);
    console.log("\n⚠️ WICHTIG: Trag die Database ID deiner 'Daily Tasks & Pipeline' Datenbank in dein lokales Jarvis Back Office ein!");
    console.log("   Tasks Database ID: " + tasksDb.id.replace(/-/g, ''));

  } catch(err) {
    console.error("\n❌ Setup fehlgeschlagen:", err.message);
  }
}

setupDashboard();
