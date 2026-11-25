import { createHash } from "node:crypto";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

interface CraftNotes {
  readonly sayability: string;
  readonly spellability: string;
  readonly memorability: string;
}

interface WordEntry {
  readonly word: string;
  readonly pronunciation: string;
  readonly ipa: string;
  readonly partOfSpeech: string;
  readonly syllables: readonly string[];
  readonly definition: string;
  readonly examples: readonly string[];
  readonly morphology: string;
  readonly lexicalGap: string;
  readonly craftNotes: CraftNotes;
}

interface ArtifactMeta {
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
}

const MAX_DEFINITION_CHARS = 140;
const WORD_PATTERN = /^[a-z]+$/;
const LINE_BREAK_PATTERN = /[\r\n\u2028\u2029]/;
const SAFE_FILENAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

const ENTRY: WordEntry = Object.freeze({
  word: "latchdoubt",
  pronunciation: "LATCH-dowt",
  ipa: "/ˈlætʃ.daʊt/",
  partOfSpeech: "noun",
  syllables: Object.freeze(["latch", "doubt"]),
  definition:
    "The nagging suspicion moments after leaving home that the door is unlocked or the stove is on, even though you checked.",
  examples: Object.freeze([
    "Halfway to the train station, latchdoubt hit so hard she walked back just to rattle the front knob.",
    "Take a quick photo of the stovetop before we leave so we avoid latchdoubt at the airport.",
    "He swore he heard the deadbolt click, yet latchdoubt still followed him down the block.",
  ]),
  morphology:
    "Compound of English 'latch' (door fastener, metonym for securing a home) and 'doubt' (lingering uncertainty).",
  lexicalGap:
    "Nearly everyone experiences the phantom certainty that they forgot to lock up or shut off an appliance minutes after leaving home, despite having just checked. English has clinical terms for anxiety and idioms for forgetfulness, but no single everyday noun for this universal threshold moment.",
  craftNotes: Object.freeze({
    sayability:
      "Two crisp, familiar English syllables with natural trochaic stress (LATCH-dowt), effortless to say aloud in casual speech.",
    spellability:
      "Built from two common, unambiguous roots with zero silent surprises beyond standard English spelling; hear it once and spell it accurately.",
    memorability:
      "Pairs a concrete physical object (a latch) with an unmistakable mental state (doubt), creating an instant visual anchor that sticks on first reading.",
  }),
});

function countChars(value: string): number {
  return [...value].length;
}

function assertNonEmptyTrimmed(label: string, value: string): void {
  if (value.length === 0 || value !== value.trim()) {
    throw new Error(`${label} must be a non-empty string without leading or trailing whitespace.`);
  }
}

function validateEntry(entry: WordEntry): void {
  if (!WORD_PATTERN.test(entry.word)) {
    throw new Error(`Invalid word format: "${entry.word}"`);
  }

  assertNonEmptyTrimmed("definition", entry.definition);
  if (LINE_BREAK_PATTERN.test(entry.definition)) {
    throw new Error("Definition must be a single line with no line breaks.");
  }

  const defChars = countChars(entry.definition);
  if (defChars > MAX_DEFINITION_CHARS) {
    throw new Error(
      `Definition length ${defChars} exceeds limit of ${MAX_DEFINITION_CHARS} characters.`,
    );
  }

  if (entry.syllables.length === 0 || entry.syllables.some((part) => !WORD_PATTERN.test(part))) {
    throw new Error("Syllables must be a non-empty list of lowercase word segments.");
  }
  if (entry.syllables.join("") !== entry.word) {
    throw new Error(
      `Syllables "${entry.syllables.join("-")}" do not recombine to "${entry.word}".`,
    );
  }

  if (entry.examples.length === 0) {
    throw new Error("Entry must include at least one usage example.");
  }
  const wordBoundary = new RegExp(`\\b${entry.word}\\b`, "i");
  for (const [index, example] of entry.examples.entries()) {
    assertNonEmptyTrimmed(`examples[${index}]`, example);
    if (LINE_BREAK_PATTERN.test(example)) {
      throw new Error(`Example ${index} must be a single line.`);
    }
    if (!wordBoundary.test(example)) {
      throw new Error(`Example ${index} must use the word "${entry.word}".`);
    }
  }

  assertNonEmptyTrimmed("partOfSpeech", entry.partOfSpeech);
  assertNonEmptyTrimmed("pronunciation", entry.pronunciation);
  assertNonEmptyTrimmed("ipa", entry.ipa);
  assertNonEmptyTrimmed("morphology", entry.morphology);
  assertNonEmptyTrimmed("lexicalGap", entry.lexicalGap);
  assertNonEmptyTrimmed("craftNotes.sayability", entry.craftNotes.sayability);
  assertNonEmptyTrimmed("craftNotes.spellability", entry.craftNotes.spellability);
  assertNonEmptyTrimmed("craftNotes.memorability", entry.craftNotes.memorability);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function renderWordText(entry: WordEntry): string {
  return `${entry.word}\n${entry.definition}\n`;
}

function renderWordJson(entry: WordEntry): string {
  const payload = {
    word: entry.word,
    part_of_speech: entry.partOfSpeech,
    pronunciation: entry.pronunciation,
    ipa: entry.ipa,
    syllables: entry.syllables,
    definition: entry.definition,
    definition_chars: countChars(entry.definition),
    max_definition_chars: MAX_DEFINITION_CHARS,
    examples: entry.examples,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function renderDossierMarkdown(entry: WordEntry): string {
  const defChars = countChars(entry.definition);
  const exampleLines = entry.examples.map((line) => `- "${line}"`).join("\n");
  return [
    `# ${entry.word}`,
    "",
    `**${entry.partOfSpeech}** | ${entry.pronunciation} | ${entry.ipa}`,
    "",
    "## One-Line Definition",
    "",
    `> ${entry.definition}`,
    "",
    `Character count: ${defChars} / ${MAX_DEFINITION_CHARS}`,
    "",
    "## Why We Need This Word",
    "",
    entry.lexicalGap,
    "",
    "## In a Sentence",
    "",
    exampleLines,
    "",
    "## Formation & Craft",
    "",
    `- **Morphology:** ${entry.morphology}`,
    `- **Sayability:** ${entry.craftNotes.sayability}`,
    `- **Spellability:** ${entry.craftNotes.spellability}`,
    `- **Memorability:** ${entry.craftNotes.memorability}`,
    "",
  ].join("\n");
}

function renderBoardHtml(entry: WordEntry): string {
  const defChars = countChars(entry.definition);
  const examplesHtml = entry.examples
    .map((line) => `        <li>&ldquo;${escapeHtml(line)}&rdquo;</li>`)
    .join("\n");
  const syllablesLabel = entry.syllables.map(escapeHtml).join(" &middot; ");

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${escapeHtml(entry.word)} &mdash; Invent a Word We Need</title>`,
    "  <style>",
    "    :root {",
    "      --bg: #f6f3ec;",
    "      --card: #fffdf8;",
    "      --ink: #1b1a17;",
    "      --muted: #5e5a52;",
    "      --rule: #ddd6c7;",
    "      --accent: #8c3b2b;",
    "    }",
    "    * { box-sizing: border-box; }",
    "    body {",
    "      margin: 0;",
    "      min-height: 100vh;",
    "      display: grid;",
    "      place-items: center;",
    "      padding: 2rem 1.25rem;",
    "      background: var(--bg);",
    "      color: var(--ink);",
    '      font-family: Georgia, "Times New Roman", serif;',
    "    }",
    "    .card {",
    "      width: 100%;",
    "      max-width: 680px;",
    "      background: var(--card);",
    "      border: 1px solid var(--rule);",
    "      border-radius: 14px;",
    "      padding: 2.5rem 2.25rem;",
    "      box-shadow: 0 12px 32px rgba(27, 26, 23, 0.06);",
    "    }",
    "    .kicker {",
    '      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;',
    "      font-size: 0.75rem;",
    "      letter-spacing: 0.12em;",
    "      text-transform: uppercase;",
    "      color: var(--accent);",
    "      margin: 0 0 0.9rem;",
    "    }",
    "    .headword {",
    "      margin: 0;",
    "      font-size: clamp(2.4rem, 6vw, 3.4rem);",
    "      line-height: 1.05;",
    "      letter-spacing: -0.02em;",
    "    }",
    "    .meta {",
    "      margin: 0.65rem 0 1.5rem;",
    "      color: var(--muted);",
    "      font-size: 1rem;",
    '      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;',
    "    }",
    "    .pos { font-style: italic; color: var(--accent); font-family: Georgia, serif; }",
    "    .definition {",
    "      margin: 0 0 1.5rem;",
    "      padding-left: 1rem;",
    "      border-left: 3px solid var(--accent);",
    "      font-size: 1.32rem;",
    "      line-height: 1.5;",
    "    }",
    "    .section-title {",
    '      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;',
    "      font-size: 0.72rem;",
    "      letter-spacing: 0.1em;",
    "      text-transform: uppercase;",
    "      color: var(--muted);",
    "      margin: 1.5rem 0 0.55rem;",
    "    }",
    "    ul { margin: 0; padding-left: 1.15rem; line-height: 1.6; color: #2f2d28; }",
    "    li { margin-bottom: 0.45rem; }",
    "    .gap { margin: 0; line-height: 1.6; color: #2f2d28; }",
    "    .footer {",
    "      margin-top: 1.75rem;",
    "      padding-top: 1rem;",
    "      border-top: 1px solid var(--rule);",
    "      display: flex;",
    "      justify-content: space-between;",
    "      flex-wrap: wrap;",
    "      gap: 0.5rem;",
    '      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;',
    "      font-size: 0.78rem;",
    "      color: var(--muted);",
    "    }",
    "  </style>",
    "</head>",
    "<body>",
    '  <article class="card">',
    '    <p class="kicker">Invent a Word We Need &middot; Lexical Entry</p>',
    `    <h1 class="headword">${escapeHtml(entry.word)}</h1>`,
    `    <p class="meta"><span class="pos">${escapeHtml(entry.partOfSpeech)}</span> &middot; ${syllablesLabel} &middot; ${escapeHtml(entry.pronunciation)} &middot; ${escapeHtml(entry.ipa)}</p>`,
    `    <p class="definition">${escapeHtml(entry.definition)}</p>`,
    '    <h2 class="section-title">In a Sentence</h2>',
    "    <ul>",
    examplesHtml,
    "    </ul>",
    '    <h2 class="section-title">The Gap It Fills</h2>',
    `    <p class="gap">${escapeHtml(entry.lexicalGap)}</p>`,
    '    <div class="footer">',
    `      <span>Definition: ${defChars}/${MAX_DEFINITION_CHARS} chars</span>`,
    `      <span>Formation: ${escapeHtml(entry.syllables.join(" + "))}</span>`,
    "    </div>",
    "  </article>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function prepareOutputDir(rawDir: string | undefined): string {
  const trimmed = rawDir?.trim();
  const outputDir = resolve(trimmed && trimmed.length > 0 ? trimmed : "output");
  mkdirSync(outputDir, { recursive: true });
  if (!statSync(outputDir).isDirectory()) {
    throw new Error(`Output path is not a directory: ${outputDir}`);
  }
  return outputDir;
}

function writeArtifact(outputDir: string, file: string, content: string): ArtifactMeta {
  if (!SAFE_FILENAME_PATTERN.test(file)) {
    throw new Error(`Invalid artifact filename: "${file}"`);
  }
  writeFileSync(join(outputDir, file), content, "utf8");
  return {
    file,
    bytes: Buffer.byteLength(content, "utf8"),
    sha256: sha256Hex(content),
  };
}

function main(): void {
  validateEntry(ENTRY);

  const outputDir = prepareOutputDir(process.env.MAKEFUN_OUTPUT_DIR);
  const defChars = countChars(ENTRY.definition);

  const artifacts: ArtifactMeta[] = [
    writeArtifact(outputDir, "word.txt", renderWordText(ENTRY)),
    writeArtifact(outputDir, "word.json", renderWordJson(ENTRY)),
    writeArtifact(outputDir, "dossier.md", renderDossierMarkdown(ENTRY)),
    writeArtifact(outputDir, "board.html", renderBoardHtml(ENTRY)),
  ];

  const dataPayload = {
    schema: "makefun.word-entry/v1",
    status: "ok",
    word: ENTRY.word,
    part_of_speech: ENTRY.partOfSpeech,
    pronunciation: ENTRY.pronunciation,
    ipa: ENTRY.ipa,
    syllables: ENTRY.syllables,
    definition: ENTRY.definition,
    definition_chars: defChars,
    max_definition_chars: MAX_DEFINITION_CHARS,
    examples: ENTRY.examples,
    morphology: ENTRY.morphology,
    lexical_gap: ENTRY.lexicalGap,
    craft_notes: ENTRY.craftNotes,
    checks: {
      single_word: WORD_PATTERN.test(ENTRY.word),
      single_line_definition: !LINE_BREAK_PATTERN.test(ENTRY.definition),
      within_char_limit: defChars <= MAX_DEFINITION_CHARS,
      deterministic: true,
    },
    artifacts,
  };

  const dataArtifact = writeArtifact(
    outputDir,
    "data.json",
    `${JSON.stringify(dataPayload, null, 2)}\n`,
  );

  const summary = {
    ok: true,
    word: ENTRY.word,
    definition: ENTRY.definition,
    definition_chars: defChars,
    artifacts: [...artifacts, dataArtifact].map((item) => item.file),
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
}