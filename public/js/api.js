var API = {
  STORAGE_KEY: 'wc_mobile_config',
  configCache: {
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
    hasApiKey: false,
    hasAuxApiKey: false,
  },

  async initConfig() {
    if (Platform.configurePreferences) {
      await Platform.configurePreferences();
    }

    await this.refreshConfig();

    var legacy = this.readLegacyConfig();
    var shouldMigrate = Object.values(legacy).some(Boolean);

    if (!shouldMigrate) {
      this.clearLegacyConfig();
      return;
    }

    try {
      await this.saveConfig(legacy);
    } catch {
      // Keep the app usable even if migration fails.
    } finally {
      this.clearLegacyConfig();
    }
  },

  async refreshConfig() {
    if (Platform.isDesktopLocalServer) {
      try {
        var res = await fetch('/api/config');
        if (!res.ok) {
          throw new Error('加载配置失败');
        }

        var data = await res.json();
        this.applyPublicConfig(data);
      } catch {
        // Ignore config refresh errors during startup.
      }
      return;
    }

    try {
      var raw = await Platform.getPreference(this.STORAGE_KEY);
      if (!raw) return;

      var parsed = JSON.parse(raw);
      this.applyPrivateConfig(parsed);
    } catch {
      // Ignore config refresh errors during startup.
    }
  },

  readLegacyConfig() {
    return {
      apiKey: localStorage.getItem('wc_api_key') || '',
      baseUrl: localStorage.getItem('wc_base_url') || '',
      model: localStorage.getItem('wc_model') || '',
      temperature: localStorage.getItem('wc_temperature') || '',
      maxTokens: localStorage.getItem('wc_max_tokens') || '',
      userName: localStorage.getItem('wc_user_name') || '',
      charName: localStorage.getItem('wc_char_name') || '',
      auxBaseUrl: localStorage.getItem('wc_aux_base_url') || '',
      auxApiKey: localStorage.getItem('wc_aux_api_key') || '',
      auxModel: localStorage.getItem('wc_aux_model') || '',
    };
  },

  clearLegacyConfig() {
    [
      'wc_api_key',
      'wc_base_url',
      'wc_model',
      'wc_temperature',
      'wc_max_tokens',
      'wc_user_name',
      'wc_char_name',
      'wc_aux_base_url',
      'wc_aux_api_key',
      'wc_aux_model',
    ].forEach(function removeKey(key) {
      localStorage.removeItem(key);
    });
  },

  applyPublicConfig(config) {
    this.configCache = {
      ...this.configCache,
      ...config,
      hasApiKey: Boolean(config.hasApiKey),
      hasAuxApiKey: Boolean(config.hasAuxApiKey),
    };
  },

  applyPrivateConfig(config) {
    this.configCache = {
      ...this.configCache,
      apiKey: config.apiKey || '',
      baseUrl: config.baseUrl || '',
      model: config.model || '',
      temperature: config.temperature || '0.8',
      maxTokens: config.maxTokens || '4096',
      userName: config.userName || '',
      charName: config.charName || '',
      auxBaseUrl: config.auxBaseUrl || '',
      auxApiKey: config.auxApiKey || '',
      auxModel: config.auxModel || '',
      hasApiKey: Boolean(config.apiKey),
      hasAuxApiKey: Boolean(config.auxApiKey),
    };
  },

  getConfig() {
    return {
      baseUrl: this.configCache.baseUrl,
      model: this.configCache.model,
      temperature: this.configCache.temperature,
      maxTokens: this.configCache.maxTokens,
      userName: this.configCache.userName,
      charName: this.configCache.charName,
      auxBaseUrl: this.configCache.auxBaseUrl,
      auxModel: this.configCache.auxModel,
      hasApiKey: this.configCache.hasApiKey,
      hasAuxApiKey: this.configCache.hasAuxApiKey,
      platform: Platform.name,
      isAndroidApp: Platform.isAndroidApp,
      supportsVision: !Platform.isAndroidApp,
    };
  },

  getPrivateConfig() {
    return { ...this.configCache };
  },

  normalizeApiUrl(baseUrl, endpointPath) {
    if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
      throw new Error('请先配置接口地址。');
    }

    var parsed;
    try {
      parsed = new URL(baseUrl.trim());
    } catch {
      throw new Error('接口地址格式不正确。');
    }

    var normalizedPath = endpointPath || '';
    var pathname = parsed.pathname.replace(/\/+$/, '');

    if (normalizedPath) {
      parsed.pathname = pathname + normalizedPath;
    } else {
      parsed.pathname = pathname || '/';
    }

    parsed.search = '';
    parsed.hash = '';

    return parsed.toString();
  },

  async saveConfig(config) {
    if (Platform.isDesktopLocalServer) {
      var res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      var data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '保存配置失败');
      }

      this.applyPublicConfig(data.config || {});
      this.clearLegacyConfig();
      return this.getConfig();
    }

    var current = this.getPrivateConfig();
    var next = {
      apiKey: typeof config.apiKey === 'string' && config.apiKey ? config.apiKey : current.apiKey,
      baseUrl: typeof config.baseUrl === 'string' ? config.baseUrl : current.baseUrl,
      model: typeof config.model === 'string' ? config.model : current.model,
      temperature: typeof config.temperature === 'string' ? config.temperature : current.temperature,
      maxTokens: typeof config.maxTokens === 'string' ? config.maxTokens : current.maxTokens,
      userName: typeof config.userName === 'string' ? config.userName : current.userName,
      charName: typeof config.charName === 'string' ? config.charName : current.charName,
      auxBaseUrl: typeof config.auxBaseUrl === 'string' ? config.auxBaseUrl : current.auxBaseUrl,
      auxApiKey:
        typeof config.auxApiKey === 'string' && config.auxApiKey ? config.auxApiKey : current.auxApiKey,
      auxModel: typeof config.auxModel === 'string' ? config.auxModel : current.auxModel,
    };

    if (next.baseUrl) this.normalizeApiUrl(next.baseUrl, '');
    if (next.auxBaseUrl) this.normalizeApiUrl(next.auxBaseUrl, '');

    await Platform.setPreference(this.STORAGE_KEY, JSON.stringify(next));
    this.applyPrivateConfig(next);
    this.clearLegacyConfig();
    return this.getConfig();
  },

  async sendMessageStream(messages, onChunk, onDone, onError) {
    if (Platform.isAndroidApp) {
      try {
        var fullText = await this.sendMessageOnce(messages);
        if (fullText) {
          onChunk(fullText, fullText);
        }
        onDone(fullText || '');
      } catch (err) {
        onError(err.message);
      }
      return;
    }

    var config = this.getConfig();
    if (!config.hasApiKey || !config.baseUrl || !config.model) {
      onError('请先在设置中保存 API 密钥、接口地址和模型名称。');
      return;
    }

    try {
      var res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages,
          stream: true,
          temperature: parseFloat(config.temperature) || 0.8,
          maxTokens: parseInt(config.maxTokens, 10) || 4096,
        }),
      });

      if (!res.ok) {
        var errData = await res.json();
        onError(errData.error || ('HTTP ' + res.status));
        return;
      }

      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      var fullText = '';

      while (true) {
        var result = await reader.read();
        if (result.done) break;

        buffer += decoder.decode(result.value, { stream: true });
        var lines = buffer.split('\n');
        buffer = lines.pop();

        for (var line of lines) {
          var trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          var data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            var parsed = JSON.parse(data);
            var delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta
              ? parsed.choices[0].delta.content
              : '';
            if (delta) {
              fullText += delta;
              onChunk(delta, fullText);
            }
          } catch {
            // Ignore malformed upstream chunks.
          }
        }
      }

      onDone(fullText);
    } catch (err) {
      onError(err.message);
    }
  },

  async requestDirectChat(messages, options) {
    var config = this.getPrivateConfig();
    if (!config.apiKey || !config.baseUrl || !config.model) {
      throw new Error('请先在设置中保存 API 密钥、接口地址和模型名称。');
    }

    var response = await Platform.httpRequest({
      method: 'POST',
      url: this.normalizeApiUrl(config.baseUrl, '/chat/completions'),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + config.apiKey,
      },
      data: {
        model: config.model,
        messages: messages,
        stream: false,
        temperature: options.temperature ?? (parseFloat(config.temperature) || 0.8),
        max_tokens: options.maxTokens ?? (parseInt(config.maxTokens, 10) || 4096),
      },
    });

    var payload = response.data;
    if (response.status < 200 || response.status >= 300) {
      throw new Error(this.readApiError(payload, '请求失败'));
    }

    return payload && payload.choices && payload.choices[0] && payload.choices[0].message
      ? payload.choices[0].message.content || ''
      : '';
  },

  readApiError(payload, fallbackMessage) {
    if (payload && typeof payload === 'object') {
      if (typeof payload.error === 'string') return payload.error;
      if (payload.error && typeof payload.error.message === 'string') return payload.error.message;
      if (typeof payload.message === 'string') return payload.message;
    }

    return fallbackMessage;
  },

  async sendMessageOnce(messages, options) {
    options = options || {};

    if (Platform.isDesktopLocalServer) {
      var config = this.getConfig();
      if (!config.hasApiKey || !config.baseUrl || !config.model) {
        throw new Error('请先在设置中保存 API 密钥、接口地址和模型名称。');
      }

      var res = await fetch('/api/chat-once', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages,
          temperature: options.temperature ?? (parseFloat(config.temperature) || 0.8),
          maxTokens: options.maxTokens ?? (parseInt(config.maxTokens, 10) || 4096),
        }),
      });

      var data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '请求失败');
      }

      return data.content || '';
    }

    return this.requestDirectChat(messages, options);
  },

  async analyzeImage(imageBase64, mimeType, prompt) {
    if (Platform.isAndroidApp) {
      throw new Error('安卓版首版暂不支持识图功能。');
    }

    var config = this.getConfig();
    if (!config.auxModel) {
      throw new Error('请先在设置中保存识图模型。');
    }

    if (!config.hasAuxApiKey && !config.hasApiKey) {
      throw new Error('请先保存识图 API 密钥，或先填写主 API 密钥。');
    }

    var res = await fetch('/api/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: imageBase64,
        mimeType: mimeType,
        prompt: prompt,
      }),
    });

    var data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || '识图请求失败');
    }

    return data.content;
  },

  async loadModels(mode) {
    mode = mode || 'primary';

    if (Platform.isDesktopLocalServer) {
      var res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: mode }),
      });

      var data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '加载模型失败');
      }

      return data.models || [];
    }

    var config = this.getPrivateConfig();
    var modelConfig = mode === 'aux'
      ? {
          apiKey: config.auxApiKey || config.apiKey,
          baseUrl: config.auxBaseUrl || config.baseUrl,
        }
      : {
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
        };

    if (!modelConfig.apiKey || !modelConfig.baseUrl) {
      throw new Error('请先在设置中保存 API 密钥和接口地址。');
    }

    var rootUrl = this.normalizeApiUrl(modelConfig.baseUrl, '');
    var base = new URL(rootUrl);
    var trimmedPath = base.pathname.replace(/\/+$/, '');
    var rootPath = trimmedPath.endsWith('/v1') ? trimmedPath.slice(0, -3) || '/' : trimmedPath || '/';
    var endpoints = [
      new URL((trimmedPath || '') + '/models', base.origin + '/').toString(),
      new URL((rootPath === '/' ? '' : rootPath) + '/v1/models', base.origin + '/').toString(),
    ];

    for (var endpoint of endpoints) {
      try {
        var response = await Platform.httpRequest({
          method: 'GET',
          url: endpoint,
          headers: {
            Authorization: 'Bearer ' + modelConfig.apiKey,
          },
        });

        if (response.status < 200 || response.status >= 300) {
          continue;
        }

        var payload = response.data || {};
        var models = (payload.data || payload.models || [])
          .map(function pickModel(item) {
            return item.id || item.name || item;
          })
          .filter(Boolean)
          .sort();

        if (models.length > 0) {
          return models;
        }
      } catch {
        // Try the next endpoint.
      }
    }

    throw new Error('没有找到可用的模型列表接口。');
  },

  async loadAuxModels() {
    return this.loadModels('aux');
  },

  async loadPreset() {
    try {
      var endpoint = Platform.isDesktopLocalServer ? '/api/preset' : 'preset.json';
      var res = await fetch(endpoint);
      if (!res.ok) throw new Error('加载预设失败');
      return await res.json();
    } catch (err) {
      console.error('加载预设失败:', err);
      return null;
    }
  },
};
