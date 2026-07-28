#!/usr/bin/env node
// Entfernt interne Erklaer-Kommentare aus fuxtools.user.js fuer einen main/Stable-Release -
// der Pflicht-UserScript-Header (@version/@match/...) und der Lizenztext direkt danach
// bleiben unangetastet, alles danach (unser eigener Code-Kommentar-Wald) wird gestrippt.
//
// Ansatz: die Datei wird an einer festen Textmarke (Start der grossen IIFE) in zwei Teile
// gesplittet. Teil 1 (Header + Lizenztext) bleibt UNVERAENDERT als reiner Text erhalten. Teil
// 2 (der komplette Script-Code) ist fuer sich allein schon ein gueltiges, eigenstaendiges
// JavaScript-Statement (die IIFE) und wird als Ganzes durch Terser gejagt (compress:false,
// mangle:false, beautify:true) - Terser parst echtes JavaScript und entfernt dabei
// ausschliesslich echte Kommentar-Token, laesst String-/Template-Literal-Inhalte (z.B. URLs
// wie "https://...", die zufaellig auch "//" enthalten) unangetastet. Ein eigener Regex-Ansatz
// waere hier gefaehrlich gewesen, siehe Testlauf in der Commit-Historie.
//
// Nutzung: node scripts/strip-comments.js [Ausgabedatei]
// Ohne Argument wird nach fuxtools.user.js.stripped geschrieben (ueberschreibt NIE die
// eigentliche Quelldatei) - beim tatsaechlichen main-Release wird das Ergebnis manuell
// geprueft und dann gezielt nach main committet.

const fs = require("fs");
const path = require("path");
const { minify } = require("terser");

const SRC = path.join(__dirname, "..", "fuxtools.user.js");
const BOUNDARY_MARKER = "(async function () {";

async function main() {
  const outPath = process.argv[2] || `${SRC}.stripped`;
  // Schutz gegen versehentliches Ueberschreiben der kommentierten Beta-Quelldatei - die
  // ist unsere einzige "Master"-Version, ein Ausgabepfad muss deshalb explizit abweichen.
  if (path.resolve(outPath) === path.resolve(SRC)) {
    throw new Error("Ausgabepfad darf nicht fuxtools.user.js selbst sein - andere Datei angeben.");
  }
  const source = fs.readFileSync(SRC, "utf8");

  const boundaryIndex = source.indexOf(BOUNDARY_MARKER);
  if (boundaryIndex === -1) {
    throw new Error(
      `Marker "${BOUNDARY_MARKER}" nicht gefunden - Aufbau von fuxtools.user.js geaendert? ` +
        "Marker in diesem Skript anpassen."
    );
  }

  const header = source.slice(0, boundaryIndex);
  const body = source.slice(boundaryIndex);

  const result = await minify(body, {
    compress: false,
    mangle: false,
    format: { beautify: true, indent_level: 2, comments: false },
  });
  if (result.error) throw result.error;

  const output = `${header}${result.code}\n`;
  fs.writeFileSync(outPath, output, "utf8");

  const removedComments = (body.match(/\/\/|\/\*/g) || []).length;
  console.log(`Geschrieben nach ${outPath}`);
  console.log(`Unveraendert erhalten: die ersten ${boundaryIndex} Zeichen (Header + Lizenztext).`);
  console.log(`Im Code-Teil entfernt: ${removedComments} Kommentar-Marker (// oder /*).`);
}

main().catch(e => {
  console.error("Fehler beim Entfernen der Kommentare:", e);
  process.exitCode = 1;
});
