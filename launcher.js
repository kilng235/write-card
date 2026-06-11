const fs = require('fs');
const net = require('net');
const path = require('path');
const { exec } = require('child_process');

const { startServer } = require('./server');
const {
  APP_NAME,
  appendAppLog,
  ensureAppDataDir,
  getAppDataPaths,
  getAppRoot,
} = require('./lib/runtime-paths');

const HEALTH_TIMEOUT_MS = 1500;
const HEALTH_RETRY_MS = 250;
const HEALTH_RETRY_COUNT = 40;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3000;

function parseCliArgs(argv = process.argv.slice(2)) {
  const result = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--host') result.host = argv[i + 1];
    if (arg === '--port') result.port = argv[i + 1];
  }

  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateLocalConfig(paths) {
  if (!fs.existsSync(paths.configPath)) {
    return;
  }

  try {
    readJsonFile(paths.configPath);
  } catch (err) {
    throw new Error(
      `配置文件已损坏，请检查或删除后重试：${paths.configPath}\n详细错误：${err.message}`
    );
  }
}

function validateAssets(appRoot) {
  const requiredPaths = [
    path.join(appRoot, 'public'),
    path.join(appRoot, 'preset.json'),
  ];

  for (const requiredPath of requiredPaths) {
    if (!fs.existsSync(requiredPath)) {
      throw new Error(`运行资源缺失：${requiredPath}`);
    }
  }
}

function getExistingRuntime(paths) {
  if (!fs.existsSync(paths.runtimePath)) {
    return null;
  }

  try {
    const runtime = readJsonFile(paths.runtimePath);
    if (!runtime || !runtime.url) {
      return null;
    }

    return runtime;
  } catch (err) {
    appendAppLog('launcher', `Failed to read runtime file: ${err.message}`);
    return null;
  }
}

async function checkHealth(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/api/health`, {
      signal: controller.signal,
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    return data && data.ok ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForHealth(url, retries = HEALTH_RETRY_COUNT) {
  for (let i = 0; i < retries; i += 1) {
    const health = await checkHealth(url);
    if (health) {
      return health;
    }

    await sleep(HEALTH_RETRY_MS);
  }

  return null;
}

function openBrowser(url) {
  return new Promise((resolve, reject) => {
    exec(`cmd /c start "" "${url}"`, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function canListen(port, host) {
  return new Promise((resolve) => {
    const tester = net.createServer();

    tester.once('error', () => {
      resolve(false);
    });

    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });

    tester.listen(port, host);
  });
}

async function choosePort(host, preferredPort = DEFAULT_PORT) {
  const normalized = Number(preferredPort);

  if (!Number.isFinite(normalized) || normalized <= 0) {
    return 0;
  }

  if (await canListen(normalized, host)) {
    return normalized;
  }

  appendAppLog('launcher', `Port ${normalized} is busy. Searching for another local port.`);

  for (let port = normalized + 1; port < normalized + 20; port += 1) {
    if (await canListen(port, host)) {
      return port;
    }
  }

  return 0;
}

async function launchExistingInstance(paths) {
  const runtime = getExistingRuntime(paths);
  if (!runtime) {
    return false;
  }

  const health = await waitForHealth(runtime.url, 3);
  if (!health) {
    appendAppLog('launcher', `Stale runtime file ignored: ${paths.runtimePath}`);
    return false;
  }

  await openBrowser(runtime.url);
  console.log(`${APP_NAME} is already running: ${runtime.url}`);
  return true;
}

async function launchNewInstance({ appRoot, host, preferredPort }) {
  const port = await choosePort(host, preferredPort);
  const started = await startServer({
    appRoot,
    host,
    port,
  });

  const health = await waitForHealth(started.url);
  if (!health) {
    throw new Error(`服务启动后健康检查未通过：${started.url}`);
  }

  await openBrowser(started.url);
  console.log(`${APP_NAME} started at ${started.url}`);

  return started;
}

async function main() {
  ensureAppDataDir();

  const paths = getAppDataPaths();
  const cli = parseCliArgs();
  const appRoot = getAppRoot();
  const host = cli.host || DEFAULT_HOST;
  const preferredPort = cli.port || process.env.PORT || DEFAULT_PORT;

  validateAssets(appRoot);
  validateLocalConfig(paths);

  const reused = await launchExistingInstance(paths);
  if (reused) {
    return;
  }

  await launchNewInstance({
    appRoot,
    host,
    preferredPort,
  });
}

if (require.main === module) {
  main().catch((err) => {
    appendAppLog('launcher', `Launch failed: ${err.stack || err.message}`);
    console.error(`WriteCard 启动失败：${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  checkHealth,
  choosePort,
  main,
  openBrowser,
  parseCliArgs,
  validateAssets,
  validateLocalConfig,
  waitForHealth,
};
