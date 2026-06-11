const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const targets = [
  {
    source: path.join(rootDir, 'preset.json'),
    dest: path.join(rootDir, 'public', 'preset.json'),
  },
  {
    source: path.join(rootDir, 'node_modules', '@capacitor', 'core', 'dist', 'capacitor.js'),
    dest: path.join(rootDir, 'public', 'vendor', 'capacitor', 'capacitor.js'),
  },
  {
    source: path.join(rootDir, 'node_modules', '@capacitor', 'preferences', 'dist', 'plugin.js'),
    dest: path.join(rootDir, 'public', 'vendor', 'capacitor', 'preferences.js'),
  },
  {
    source: path.join(rootDir, 'node_modules', '@capacitor', 'share', 'dist', 'plugin.js'),
    dest: path.join(rootDir, 'public', 'vendor', 'capacitor', 'share.js'),
  },
  {
    source: path.join(rootDir, 'node_modules', '@capacitor', 'clipboard', 'dist', 'plugin.js'),
    dest: path.join(rootDir, 'public', 'vendor', 'capacitor', 'clipboard.js'),
  },
];

for (const target of targets) {
  if (!fs.existsSync(target.source)) {
    throw new Error(`Missing Capacitor asset: ${target.source}`);
  }

  fs.mkdirSync(path.dirname(target.dest), { recursive: true });
  fs.copyFileSync(target.source, target.dest);
}

console.log('Synced Capacitor browser assets to public/vendor/capacitor');
