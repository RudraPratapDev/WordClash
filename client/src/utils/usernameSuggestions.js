const PREFIXES = [
  'Crimson',
  'Lucky',
  'Midnight',
  'Silent',
  'Rapid',
  'Fuzzy',
  'Atomic',
  'Golden',
  'Neon',
  'Retro',
  'Clever',
  'Turbo',
];

const NOUNS = [
  'Fox',
  'Panda',
  'Raven',
  'Otter',
  'Comet',
  'Nomad',
  'Cipher',
  'Falcon',
  'Voyager',
  'Nimbus',
  'Maverick',
  'Sprinter',
];

export function getSuggestedUsername() {
  const left = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
  const right = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const suffix = Math.floor(Math.random() * 900 + 100);
  return `${left}${right}${suffix}`;
}
