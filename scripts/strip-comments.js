#!/usr/bin/env node
// Nutzung: node scripts/strip-comments.js [Ausgabedatei]
// Ohne Argument wird nach fuxtools.user.js.stripped geschrieben (überschreibt NIE die
// Quelldatei selbst).

const fs = require("fs");
const path = require("path");
const { minify } = require("terser");

const SRC = path.join(__dirname, "..", "fuxtools.user.js");
const BOUNDARY_MARKER = "(async function () {";

async function main() {
  const outPath = process.argv[2] || `${SRC}.stripped`;
  if (path.resolve(outPath) === path.resolve(SRC)) {
    throw new Error("Ausgabepfad darf nicht fuxtools.user.js selbst sein - andere Datei angeben.");
  }
  const source = fs.readFileSync(SRC, "utf8");

  const boundaryIndex = source.indexOf(BOUNDARY_MARKER);
  if (boundaryIndex === -1) {
    throw new Error(
      `Marker "${BOUNDARY_MARKER}" nicht gefunden - Aufbau von fuxtools.user.js geändert? ` +
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
  console.log(`Unverändert erhalten: die ersten ${boundaryIndex} Zeichen (Header + Lizenztext).`);
  console.log(`Im Code-Teil entfernt: ${removedComments} Kommentar-Marker (// oder /*).`);
}

main().catch(e => {
  console.error("Fehler beim Entfernen der Kommentare:", e);
  process.exitCode = 1;
});
