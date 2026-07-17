const fs = require('fs');
const pdf = require('pdf-parse');

async function testParse() {
  const file2 = fs.readFileSync('/Users/rico/dev/calling-station/detail.pdf');
  const data2 = await pdf(file2);
  const lines = data2.text.split('\n');

  const results = [];
  
  // Date pattern: DD.MM.YY
  const lineRegex = /^(\d{2}\.\d{2}\.\d{2})(150470)(\d{7})(.*?)(Strom|Gas)(.*?)(\d{2}\.\d{2}\.\d{2})(Storno|EP|VAP|RR nach EP|RR nach VAP)(.*?)(\-?\d+,\d{2})0%$/;

  for (const line of lines) {
    const match = line.trim().match(lineRegex);
    if (match) {
      const einreichungDatum = match[1];
      const auftrag = match[3];
      const nameZaehler = match[4];
      const product = match[5];
      const leistungsDatum = match[7];
      const art = match[8];
      
      const financialPart = match[9]; // e.g. "48,5048,50" -> basis = 48,50, aktuell = 48,50. If Storno: "161,000,00" -> basis=161,00, aktuell=0,00
      const provisionAmount = match[10]; // This captures the last number before 0%, which is "aktuell" -> Wait!
      
      // Let's refine Name and Zaehler
      // Zähler usually ends the nameZaehler string, e.g. "Stückwerk Pizza...1EFR246203..."
      // Look for the last chunk of caps/numbers
      const zaehlerRegex = /([A-Z0-9]+(?:\.\.\.)?)$/;
      const zMatch = nameZaehler.match(zaehlerRegex);
      let name = nameZaehler;
      let zaehler = '';
      if (zMatch) {
         zaehler = zMatch[1];
         name = nameZaehler.substring(0, nameZaehler.length - zaehler.length);
      }
      
      results.push({
        name,
        zaehler,
        product,
        art,
        provision: provisionAmount,
        rawLine: line.trim()
      });
    }
  }

  console.log(JSON.stringify(results, null, 2));
}

testParse();
