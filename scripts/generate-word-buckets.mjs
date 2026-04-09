import fs from 'fs';
import path from 'path';

const root = process.cwd();
const sourcePath = path.join(root, 'data', 'words_alpha.txt');
const outputPath = path.join(root, 'server', 'src', 'game', 'wordBuckets.json');

const raw = fs.readFileSync(sourcePath, 'utf8');
const lines = raw.split(/\r?\n/);

const buckets = {
  words4: new Set(),
  words5: new Set(),
  words6: new Set(),
};

for (const line of lines) {
  const word = line.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(word)) continue;

  if (word.length === 4) buckets.words4.add(word);
  else if (word.length === 5) buckets.words5.add(word);
  else if (word.length === 6) buckets.words6.add(word);
}

const output = {
  generatedAt: new Date().toISOString(),
  source: 'data/words_alpha.txt',
  words4: [...buckets.words4].sort(),
  words5: [...buckets.words5].sort(),
  words6: [...buckets.words6].sort(),
};

fs.writeFileSync(outputPath, JSON.stringify(output));

console.log('Word buckets generated');
console.log(`4-letter: ${output.words4.length}`);
console.log(`5-letter: ${output.words5.length}`);
console.log(`6-letter: ${output.words6.length}`);
console.log(`Output: ${outputPath}`);
