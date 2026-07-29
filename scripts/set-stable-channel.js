#!/usr/bin/env node
// Stellt aus einem beta-Stand eine main/Stable-Version her: schaltet nur noch das kosmetische
// CHANNEL-Label auf "stable" um. @updateURL/@downloadURL zeigen inzwischen in BEIDEN Repos
// bereits auf main (es gibt keinen oeffentlichen beta-Branch als eigenen Verteil-Kanal mehr) -
// hier also nichts mehr umzuschreiben.
//
// Nutzung: node scripts/set-stable-channel.js <Eingabedatei> <Ausgabedatei>

const fs = require("fs");

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("Nutzung: node scripts/set-stable-channel.js <Eingabedatei> <Ausgabedatei>");
  process.exit(1);
}

let code = fs.readFileSync(inPath, "utf8");

const pattern = /const CHANNEL = "beta";/;
if (!pattern.test(code)) {
  console.error('Konnte "const CHANNEL = \\"beta\\";" nicht finden (Konfiguration geändert?).');
  process.exit(1);
}
code = code.replace(pattern, 'const CHANNEL = "stable";');

fs.writeFileSync(outPath, code, "utf8");
console.log(`Kanal-Label auf "stable" umgestellt, geschrieben nach ${outPath}`);
