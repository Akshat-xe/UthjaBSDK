const fs = require('node:fs');
const path = require('node:path');
const prettier = require('prettier');

const source = require('@iconify-json/ph/icons.json');
const names = [
  'house',
  'calendar-blank',
  'chart-bar',
  'envelope-simple',
  'notebook',
  'fork-knife',
  'suitcase',
  'target',
  'chart-line-up',
  'wrench',
  'caret-down',
  'dots-three',
  'sun',
  'arrow-up-right',
  'book-open',
  'sparkle',
  'backpack',
  'moon',
  'waves',
  'list-checks',
  'bed',
  'washing-machine',
  'coffee',
  'lightbulb',
  'alarm',
  'sun-horizon-bold',
  'shower-bold',
  'book-open-text-bold',
  'backpack-bold',
  'coffee-fill',
  'bowl-food-fill',
  'person-simple-walk-bold',
  'chalkboard-teacher-bold',
  'trophy-bold',
  'moon-stars-bold',
  'lightbulb-bold',
  'books-bold',
  'person-simple-swim-bold',
  'bed-bold',
  'washing-machine-bold',
  'list-checks-bold',
  'cookie-fill',
  'bowl-steam-fill',
  'drop-fill',
];
const icons = Object.fromEntries(
  names.map((name) => {
    const icon = source.icons[name];
    if (!icon) throw new Error(`Missing Phosphor icon: ${name}`);
    return [`ph:${name}`, icon.body];
  }),
);
const destination = path.join(__dirname, '..', 'src', 'ui', 'components', 'icon-data.ts');
const sourceText = `// Generated from @iconify-json/ph by scripts/generate-icons.cjs.\nexport const ICONS: Record<string, string> = ${JSON.stringify(icons, null, 2)};\n`;
prettier
  .format(sourceText, { parser: 'typescript', singleQuote: true })
  .then((formatted) => {
    fs.writeFileSync(destination, formatted);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
