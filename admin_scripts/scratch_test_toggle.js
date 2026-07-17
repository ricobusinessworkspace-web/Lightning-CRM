const db = require('./core/db.js');

async function run() {
  const leads = await db.getLeads({all: true});
  if (leads.length > 0) {
    const l = leads[0];
    console.log("INITIAL:", {id: l.id, name: l.name, interest_strom: l.interest_strom});
    
    // Toggle ON
    l.interest_strom = l.interest_strom ? 0 : 1;
    await db.saveLead(l);
    let updated = (await db.getLeads({all:true})).find(x => x.id === l.id);
    console.log("AFTER TOGGLE ON:", {id: updated.id, interest_strom: updated.interest_strom});

    // Toggle OFF
    updated.interest_strom = updated.interest_strom ? 0 : 1;
    await db.saveLead(updated);
    let updated2 = (await db.getLeads({all:true})).find(x => x.id === l.id);
    console.log("AFTER TOGGLE OFF:", {id: updated2.id, interest_strom: updated2.interest_strom});
  }
}
run();
