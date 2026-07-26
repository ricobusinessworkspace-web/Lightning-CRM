const { JSDOM } = require("jsdom");
const fs = require("fs");
const html = fs.readFileSync("./index.html", "utf-8");
const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
const window = dom.window;
const document = window.document;
global.window = window;
global.document = document;
global.HTMLElement = window.HTMLElement;
window.requestAnimationFrame = cb => setTimeout(cb, 0);

const code = fs.readFileSync("./public/ui/pipeline_ui.js", "utf-8");
try {
  //
} catch (e) {
  console.log("Syntax Error:", e);
}

window.api = { getLeads: async () => [{id: 1, name: 'Test Lead', phone: '123'}] };
window.store = { state: { currentSnoozeOffset: 0 } };
window.globalUser = { role: 'admin' };
window.globalUsersList = [];
window.renderTasksList = () => {}; window.eval(code);

(async () => {
  try {
    await window.openLeadDirectly(1);
    console.log("Success! Sidebar HTML:", document.getElementById('main-sidebar').innerHTML.substring(0, 100));
  } catch (e) {
    console.log("Runtime Error:", e.stack);
  }
})();
