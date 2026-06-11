const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_NAME = 'WriteCard';

function getAppRoot() {
  if (process.env.WRITE_CARD_APP_ROOT) {
    return process.env.WRITE_CARD_APP_ROOT;
  }

  if (process.pkg) {
    return path.dirname(process.execPath);
  }

  return path.resolve(__dirname, '..');
}

function getAppDataDir() {
  const baseDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(baseDir, APP_NAME);
}

function ensureAppDataDir() {
  const dataDir = getAppDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true });
  return dataDir;
}

function getAppDataPaths() {
  const dataDir = ensureAppDataDir();

  return {
    dataDir,
    configPath: path.join(dataDir, 'config.json'),
    runtimePath: path.join(dataDir, 'runtime.json'),
    logsDir: path.join(dataDir, 'logs'),
  };
}

function appendAppLog(component, message) {
  try {
    const { logsDir } = getAppDataPaths();
    const filePath = path.join(logsDir, `${component}.log`);
    const line = `[${new Date().toISOString()}] ${message}${os.EOL}`;
    fs.appendFileSync(filePath, line, 'utf8');
  } catch {
    // Logging should never crash the app.
  }
}

module.exports = {
  APP_NAME,
  appendAppLog,
  ensureAppDataDir,
  getAppDataDir,
  getAppDataPaths,
  getAppRoot,
};
