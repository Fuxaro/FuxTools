#!/usr/bin/env node
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
