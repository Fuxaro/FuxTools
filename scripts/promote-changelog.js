#!/usr/bin/env node
// Erstellt aus dem CHANGELOG.md-Stand von beta die main/Stable-Version: der "## Beta"-
// Abschnitt wird zum neuen "## Stable (vX.Y.Z)"-Abschnitt - der alte "## Stable (...)"-
// Abschnitt entfällt dabei, weil die neue Stable-Version ja bereits alles enthält, was vorher
// unter Beta stand (keine separate Aufzählung mehr nötig).
//
// Nutzung: node scripts/promote-changelog.js <Eingabedatei> <Ausgabedatei> <Version>

const fs = require("fs");

const [, , inPath, outPath, version] = process.argv;
if (!inPath || !outPath || !version) {
  console.error("Nutzung: node scripts/promote-changelog.js <Eingabedatei> <Ausgabedatei> <Version>");
  process.exit(1);
}

const source = fs.readFileSync(inPath, "utf8");
const lines = source.split("\n");

const headingIndexes = [];
lines.forEach((line, i) => {
  if (/^## /.test(line)) headingIndexes.push(i);
});

const betaHeadingIndex = lines.findIndex(line => line.trim() === "## Beta");
if (betaHeadingIndex === -1) {
  console.error('Konnte keinen "## Beta"-Abschnitt in der CHANGELOG.md finden - Struktur geändert?');
  process.exit(1);
}

const nextHeadingAfterBeta = headingIndexes.find(i => i > betaHeadingIndex);
const betaSectionEnd = nextHeadingAfterBeta === undefined ? lines.length : nextHeadingAfterBeta;
const betaBody = lines
  .slice(betaHeadingIndex + 1, betaSectionEnd)
  .join("\n")
  .replace(/\n+$/, "");

const intro = lines
  .slice(0, betaHeadingIndex)
  .join("\n")
  .replace(/\n+$/, "");

const output = `${intro}\n\n## Stable (v${version})\n${betaBody}\n`;

fs.writeFileSync(outPath, output, "utf8");
console.log(`CHANGELOG.md für main geschrieben nach ${outPath} (Stable v${version}).`);
