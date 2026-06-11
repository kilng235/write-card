const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const releaseRoot = path.join(distRoot, 'write-card');

const requiredEntries = [
  'launcher.js',
  'server.js',
  'preset.json',
  'public',
  'lib',
];

const forbiddenPatterns = [
  '.server-config.json',
  '.codex-server.out.log',
  '.codex-server.err.log',
  'server.stdout.log',
  'server.stderr.log',
  'runtime.json',
  'config.json',
];

function removeDir(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function assertRequiredEntries() {
  for (const entry of requiredEntries) {
    const fullPath = path.join(projectRoot, entry);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Missing required release asset: ${entry}`);
    }
  }
}

function copyEntry(relativePath) {
  const source = path.join(projectRoot, relativePath);
  const destination = path.join(releaseRoot, relativePath);
  const stat = fs.statSync(source);

  if (stat.isDirectory()) {
    fs.cpSync(source, destination, {
      recursive: true,
      force: true,
    });
    return;
  }

  ensureDir(path.dirname(destination));
  fs.copyFileSync(source, destination);
}

function sanitizePackageJson() {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  const safePackageJson = {
    name: packageJson.name,
    version: packageJson.version,
    description: packageJson.description,
    main: packageJson.main,
    scripts: {
      launch: packageJson.scripts?.launch || 'node launcher.js',
      start: packageJson.scripts?.start || 'node server.js',
    },
  };

  fs.writeFileSync(
    path.join(releaseRoot, 'package.json'),
    JSON.stringify(safePackageJson, null, 2),
    'utf8'
  );
}

function writeUserGuide() {
  const lines = [
    'WriteCard Windows Release',
    '',
    '1. Double-click write-card.exe to start the local tool.',
    '2. The app opens in your default browser.',
    '3. On first launch, open Settings and paste your own API Key.',
    '4. Your key is stored only on this PC under %APPDATA%\\WriteCard\\config.json.',
    '',
    'If write-card.exe is not present yet, run:',
    'npm run build:exe',
  ];

  fs.writeFileSync(path.join(releaseRoot, 'README.txt'), lines.join('\r\n'), 'utf8');
}

function ensureForbiddenFilesExcluded() {
  const found = [];

  function walk(currentPath, relativeBase = '') {
    const stat = fs.statSync(currentPath);

    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(currentPath)) {
        walk(path.join(currentPath, name), path.join(relativeBase, name));
      }
      return;
    }

    const fileName = path.basename(currentPath);
    if (forbiddenPatterns.includes(fileName)) {
      found.push(relativeBase);
    }
  }

  walk(releaseRoot);

  if (found.length > 0) {
    throw new Error(`Forbidden files found in release package: ${found.join(', ')}`);
  }
}

function main() {
  assertRequiredEntries();
  removeDir(distRoot);
  ensureDir(releaseRoot);

  for (const entry of requiredEntries) {
    copyEntry(entry);
  }

  sanitizePackageJson();
  writeUserGuide();
  ensureForbiddenFilesExcluded();

  console.log(`Release staging prepared at ${releaseRoot}`);
}

main();
