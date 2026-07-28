#!/usr/bin/env node
// Stellt aus einem beta-Stand eine main/Stable-Version her: schaltet CHANNEL auf "stable" und
// @updateURL/@downloadURL auf den main-Branch um - genau die zwei Stellen, die laut dem
// Kommentar im KONFIGURATION-Block von fuxtools.user.js manuell fuer main gesetzt werden
// muessen. @icon zeigt schon immer auf main (kanal-unabhaengig), bleibt unveraendert.
//
// Nutzung: node scripts/set-stable-channel.js <Eingabedatei> <Ausgabedatei>

const fs = require("fs");

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("Nutzung: node scripts/set-stable-channel.js <Eingabedatei> <Ausgabedatei>");
  process.exit(1);
}

let code = fs.readFileSync(inPath, "utf8");

const replacements = [
  [
    /\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/Fuxaro\/FuxTools\/beta\/fuxtools\.user\.js/,
    "// @updateURL   https://raw.githubusercontent.com/Fuxaro/FuxTools/main/fuxtools.user.js",
  ],
  [
    /\/\/ @downloadURL\s+https:\/\/raw\.githubusercontent\.com\/Fuxaro\/FuxTools\/beta\/fuxtools\.user\.js/,
    "// @downloadURL https://raw.githubusercontent.com/Fuxaro/FuxTools/main/fuxtools.user.js",
  ],
  [/const CHANNEL = "beta";/, 'const CHANNEL = "stable";'],
];

const missed = replacements.filter(([pattern]) => !pattern.test(code)).map(([pattern]) => pattern.source);
if (missed.length) {
  console.error("Konnte folgende Stellen nicht finden (Header/Konfiguration geändert?):");
  missed.forEach(m => console.error(` - ${m}`));
  process.exit(1);
}

for (const [pattern, replacement] of replacements) {
  code = code.replace(pattern, replacement);
}

fs.writeFileSync(outPath, code, "utf8");
console.log(`Kanal auf "stable" umgestellt, geschrieben nach ${outPath}`);
