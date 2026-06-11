const express = require('express');
const fs = require('fs');
const net = require('net');
const path = require('path');

const {
  appendAppLog,
  ensureAppDataDir,
  getAppDataPaths,
  getAppRoot,
} = require('./lib/runtime-paths');

const REQUEST_TIMEOUT_MS = 30000;

function parseCliArgs(argv = process.argv.slice(2)) {
  const result = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--port') result.port = argv[i + 1];
    if (arg === '--host') result.host = argv[i + 1];
    if (arg === '--no-runtime-file') result.noRuntimeFile = true;
  }

  return result;
}

function isPrivateHostname(hostname) {
  const normalized = hostname.toLowerCase();

  if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
    return true;
  }

  if (net.isIP(normalized) === 4) {
    const parts = normalized.split('.').map(Number);
    const [a, b] = parts;

    if (a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
  }

  if (net.isIP(normalized) === 6) {
    return (
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:')
    );
  }

  return false;
}

function normalizeApiUrl(baseUrl, endpointPath) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    throw new Error('Please configure Base URL first.');
  }

  let parsed;
  try {
    parsed = new URL(baseUrl.trim());
  } catch {
    throw new Error('Base URL is invalid.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Base URL must use http or https.');
  }

  if (!parsed.hostname) {
    throw new Error('Base URL is missing a hostname.');
  }

  if (isPrivateHostname(parsed.hostname)) {
    throw new Error('Private or local network addresses are not allowed.');
  }

  const pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.pathname = endpointPath ? `${pathname}${endpointPath}` : pathname || '/';
  parsed.search = '';
  parsed.hash = '';

  return parsed.toString();
}

function defaultConfig() {
  return {
    apiKey: '',
    baseUrl: '',
    model: '',
    temperature: '0.8',
    maxTokens: '4096',
    userName: '',
    charName: '',
    auxBaseUrl: '',
    auxApiKey: '',
    auxModel: '',
  };
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    appendAppLog('server', `Failed to read JSON file ${filePath}: ${err.message}`);
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function createConfigStore(paths) {
  return {
    read() {
      return { ...defaultConfig(), ...readJsonFile(paths.configPath, {}) };
    },
    write(config) {
      writeJsonFile(paths.configPath, config);
    },
  };
}

function toPublicConfig(config) {
  return {
    baseUrl: config.baseUrl || '',
    model: config.model || '',
    temperature: config.temperature || '0.8',
    maxTokens: config.maxTokens || '4096',
    userName: config.userName || '',
    charName: config.charName || '',
    auxBaseUrl: config.auxBaseUrl || '',
    auxModel: config.auxModel || '',
    hasApiKey: Boolean(config.apiKey),
    hasAuxApiKey: Boolean(config.auxApiKey),
  };
}

function mergeConfig(current, incoming = {}) {
  const next = { ...current };
  const textFields = [
    'baseUrl',
    'model',
    'temperature',
    'maxTokens',
    'userName',
    'charName',
    'auxBaseUrl',
    'auxModel',
  ];

  for (const key of textFields) {
    if (Object.prototype.hasOwnProperty.call(incoming, key)) {
      next[key] = String(incoming[key] ?? '').trim();
    }
  }

  if (Object.prototype.hasOwnProperty.call(incoming, 'apiKey')) {
    const value = String(incoming.apiKey ?? '').trim();
    if (value) next.apiKey = value;
  }

  if (Object.prototype.hasOwnProperty.call(incoming, 'auxApiKey')) {
    const value = String(incoming.auxApiKey ?? '').trim();
    if (value) next.auxApiKey = value;
  }

  if (incoming.clearApiKey === true) next.apiKey = '';
  if (incoming.clearAuxApiKey === true) next.auxApiKey = '';

  return next;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function handleFetchError(res, err) {
  if (err.name === 'AbortError') {
    return res.status(504).json({ error: 'Upstream request timed out.' });
  }

  return res.status(500).json({ error: `Request failed: ${err.message}` });
}

async function requestChatCompletion({ apiKey, baseUrl, model, messages, stream, temperature, maxTokens }) {
  const url = normalizeApiUrl(baseUrl, '/chat/completions');

  return fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: Boolean(stream),
      temperature: temperature ?? 0.8,
      max_tokens: maxTokens ?? 4096,
    }),
  });
}

function buildApp({ appRoot, paths, runtimeState }) {
  const app = express();
  const publicDir = path.join(appRoot, 'public');
  const presetPath = path.join(appRoot, 'preset.json');
  const configStore = createConfigStore(paths);

  if (!fs.existsSync(publicDir)) {
    throw new Error(`Missing public assets directory: ${publicDir}`);
  }

  if (!fs.existsSync(presetPath)) {
    throw new Error(`Missing preset.json: ${presetPath}`);
  }

  app.use(express.json({ limit: '10mb' }));
  app.use(express.static(publicDir));

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      app: 'WriteCard',
      url: runtimeState.url,
      dataDir: paths.dataDir,
    });
  });

  app.get('/api/config', (req, res) => {
    res.json(toPublicConfig(configStore.read()));
  });

  app.post('/api/config', (req, res) => {
    try {
      const current = configStore.read();
      const next = mergeConfig(current, req.body || {});

      if (next.baseUrl) normalizeApiUrl(next.baseUrl, '');
      if (next.auxBaseUrl) normalizeApiUrl(next.auxBaseUrl, '');

      configStore.write(next);
      return res.json({ ok: true, config: toPublicConfig(next) });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Failed to save config.' });
    }
  });

  app.post('/api/chat', async (req, res) => {
    const stored = configStore.read();
    const { messages, stream, temperature, maxTokens } = req.body || {};

    if (!stored.apiKey || !stored.baseUrl || !stored.model) {
      return res.status(400).json({ error: 'Please configure API Key, Base URL, and model in Settings first.' });
    }

    try {
      const apiRes = await requestChatCompletion({
        apiKey: stored.apiKey,
        baseUrl: stored.baseUrl,
        model: stored.model,
        messages,
        stream,
        temperature,
        maxTokens,
      });

      if (!apiRes.ok) {
        const errText = await apiRes.text();
        return res.status(apiRes.status).json({ error: `API error (${apiRes.status}): ${errText}` });
      }

      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const reader = apiRes.body.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(decoder.decode(value, { stream: true }));
          }
        } catch {
          // Client disconnected while streaming.
        }

        return res.end();
      }

      return res.json(await apiRes.json());
    } catch (err) {
      if (String(err.message || '').includes('Base URL') || String(err.message || '').includes('Private or local')) {
        return res.status(400).json({ error: err.message });
      }

      return handleFetchError(res, err);
    }
  });

  app.post('/api/chat-once', async (req, res) => {
    const stored = configStore.read();
    const { messages, temperature, maxTokens } = req.body || {};

    if (!stored.apiKey || !stored.baseUrl || !stored.model) {
      return res.status(400).json({ error: 'Please configure API Key, Base URL, and model in Settings first.' });
    }

    try {
      const apiRes = await requestChatCompletion({
        apiKey: stored.apiKey,
        baseUrl: stored.baseUrl,
        model: stored.model,
        messages,
        stream: false,
        temperature,
        maxTokens,
      });

      if (!apiRes.ok) {
        const errText = await apiRes.text();
        return res.status(apiRes.status).json({ error: `API error (${apiRes.status}): ${errText}` });
      }

      const data = await apiRes.json();
      return res.json({
        content: data.choices?.[0]?.message?.content || '',
        raw: data,
      });
    } catch (err) {
      if (String(err.message || '').includes('Base URL') || String(err.message || '').includes('Private or local')) {
        return res.status(400).json({ error: err.message });
      }

      return handleFetchError(res, err);
    }
  });

  app.post('/api/vision', async (req, res) => {
    const stored = configStore.read();
    const visionConfig = {
      apiKey: stored.auxApiKey || stored.apiKey,
      baseUrl: stored.auxBaseUrl || stored.baseUrl,
      model: stored.auxModel,
    };
    const { imageBase64, mimeType, prompt } = req.body || {};

    if (!visionConfig.apiKey || !visionConfig.baseUrl || !visionConfig.model) {
      return res.status(400).json({ error: 'Please configure the vision model in Settings first.' });
    }

    let url;
    try {
      url = normalizeApiUrl(visionConfig.baseUrl, '/chat/completions');
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              prompt ||
              'Describe the visible character appearance in detail, including hair, face, body type, outfit, accessories, and standout traits for character-card writing.',
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType || 'image/png'};base64,${imageBase64}`,
            },
          },
        ],
      },
    ];

    try {
      const apiRes = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${visionConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: visionConfig.model,
          messages,
          max_tokens: 2048,
        }),
      });

      if (!apiRes.ok) {
        const errText = await apiRes.text();
        return res.status(apiRes.status).json({ error: `API error (${apiRes.status}): ${errText}` });
      }

      const data = await apiRes.json();
      return res.json({ content: data.choices?.[0]?.message?.content || '' });
    } catch (err) {
      return handleFetchError(res, err);
    }
  });

  app.post('/api/models', async (req, res) => {
    const config = configStore.read();
    const mode = (req.body && req.body.mode) || 'primary';
    const modelConfig =
      mode === 'aux'
        ? {
            apiKey: config.auxApiKey || config.apiKey,
            baseUrl: config.auxBaseUrl || config.baseUrl,
          }
        : {
            apiKey: config.apiKey,
            baseUrl: config.baseUrl,
          };

    if (!modelConfig.apiKey || !modelConfig.baseUrl) {
      return res.status(400).json({ error: 'Please save API Key and Base URL in Settings first.' });
    }

    let rootUrl;
    try {
      rootUrl = normalizeApiUrl(modelConfig.baseUrl, '');
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const base = new URL(rootUrl);
    const trimmedPath = base.pathname.replace(/\/+$/, '');
    const rootPath = trimmedPath.endsWith('/v1') ? trimmedPath.slice(0, -3) || '/' : trimmedPath || '/';
    const endpoints = [
      new URL(`${trimmedPath || ''}/models`, `${base.origin}/`).toString(),
      new URL(`${rootPath === '/' ? '' : rootPath}/v1/models`, `${base.origin}/`).toString(),
    ];

    for (const endpoint of endpoints) {
      try {
        const apiRes = await fetchWithTimeout(endpoint, {
          headers: {
            Authorization: `Bearer ${modelConfig.apiKey}`,
          },
        });

        if (!apiRes.ok) continue;

        const data = await apiRes.json();
        const models = (data.data || data.models || [])
          .map((item) => item.id || item.name || item)
          .filter(Boolean)
          .sort();

        return res.json({ models });
      } catch (err) {
        if (err.name === 'AbortError') {
          return res.status(504).json({ error: 'Upstream request timed out.' });
        }
      }
    }

    return res.status(500).json({ error: 'Unable to load model list. Please check Base URL and API Key.' });
  });

  app.get('/api/preset', (req, res) => {
    try {
      delete require.cache[require.resolve(presetPath)];
      res.json(require(presetPath));
    } catch (err) {
      appendAppLog('server', `Failed to load preset.json: ${err.message}`);
      res.status(500).json({ error: 'Failed to load preset.json.' });
    }
  });

  return app;
}

function writeRuntimeFile(paths, data) {
  writeJsonFile(paths.runtimePath, data);
}

function clearRuntimeFile(paths, pid) {
  try {
    if (!fs.existsSync(paths.runtimePath)) return;
    const runtime = readJsonFile(paths.runtimePath, null);
    if (runtime && runtime.pid && runtime.pid !== pid) return;
    fs.unlinkSync(paths.runtimePath);
  } catch (err) {
    appendAppLog('server', `Failed to clear runtime file: ${err.message}`);
  }
}

async function startServer(options = {}) {
  ensureAppDataDir();

  const appRoot = options.appRoot || getAppRoot();
  const paths = getAppDataPaths();
  const runtimeState = {
    url: null,
  };
  const app = buildApp({ appRoot, paths, runtimeState });
  const preferredPort = Number(
    options.port ??
      process.env.PORT ??
      parseCliArgs().port ??
      3000
  );
  const host = options.host || process.env.HOST || parseCliArgs().host || '127.0.0.1';
  const writeRuntime = options.writeRuntime !== false && !parseCliArgs().noRuntimeFile;

  return await new Promise((resolve, reject) => {
    let settled = false;

    function finish(err, value) {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(value);
    }

    function listenOn(portToUse) {
      const server = app.listen(portToUse, host);

      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && portToUse !== 0 && !options.disablePortFallback) {
          appendAppLog('server', `Port ${portToUse} is in use. Falling back to a random free port.`);
          return listenOn(0);
        }

        finish(err);
      });

      server.once('listening', () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : portToUse;
        const url = `http://${host}:${port}`;
        runtimeState.url = url;

        if (writeRuntime) {
          writeRuntimeFile(paths, {
            pid: process.pid,
            port,
            host,
            url,
            startedAt: new Date().toISOString(),
            appRoot,
          });
        }

        const cleanup = () => clearRuntimeFile(paths, process.pid);
        server.once('close', cleanup);
        process.once('exit', cleanup);
        process.once('SIGINT', () => {
          server.close(() => process.exit(0));
        });
        process.once('SIGTERM', () => {
          server.close(() => process.exit(0));
        });

        appendAppLog('server', `Server started at ${url}`);
        console.log(`Server started at ${url}`);

        finish(null, {
          app,
          server,
          url,
          host,
          port,
          appRoot,
          dataDir: paths.dataDir,
          paths,
        });
      });
    }

    listenOn(Number.isFinite(preferredPort) ? preferredPort : 3000);
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    appendAppLog('server', `Startup failed: ${err.stack || err.message}`);
    console.error(`Failed to start WriteCard: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  parseCliArgs,
  startServer,
};
