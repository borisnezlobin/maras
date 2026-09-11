import { writeFileSync } from "node:fs";

/**
 * Builds the dictionary the grinder scans every address against. Common words keep the finds
 * meaningful to a person; the full system dictionary would flag "abaca" as interesting.
 */
const SOURCE =
  "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears.txt";

const OUTPUT = "miner/grinder/words.txt";

const HEX_LETTERS = new Set("abcdef");

const DIGIT_FOR_LETTER: Record<string, string> = {
  o: "0",
  i: "1",
  l: "1",
  s: "5",
  t: "7",
  g: "9",
};

const MIN_LETTERS = 4;

/** The contract stores each pattern as a bytes4, so nothing longer can be claimed. */
const MAX_LETTERS = 8;

function hexSpelling(word: string): string | undefined {
  let spelling = "";
  for (const letter of word) {
    if (HEX_LETTERS.has(letter)) spelling += letter;
    else if (letter in DIGIT_FOR_LETTER) spelling += DIGIT_FOR_LETTER[letter];
    else return undefined;
  }
  return spelling;
}

/**
 * A spelling made mostly of digits stops reading as a word: "7015" for "tois" is noise. At least
 * half the letters have to survive as themselves.
 */
function readsAsWord(word: string): boolean {
  const kept = [...word].filter((letter) => HEX_LETTERS.has(letter)).length;
  return kept * 2 >= word.length && kept >= 2;
}

function fitsLength(word: string): boolean {
  return word.length >= MIN_LETTERS && word.length <= MAX_LETTERS;
}

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`fetching ${SOURCE} failed with ${response.status}`);

const seen = new Set<string>();
const lines: string[] = [];

for (const word of (await response.text()).split("\n").map((line) => line.trim().toLowerCase())) {
  if (!fitsLength(word) || !readsAsWord(word)) continue;
  const spelling = hexSpelling(word);
  if (spelling === undefined || seen.has(spelling)) continue;
  seen.add(spelling);
  lines.push(`${spelling} ${word}`);
}

writeFileSync(OUTPUT, `${lines.join("\n")}\n`);
console.log(`Wrote ${lines.length} words to ${OUTPUT}`);
