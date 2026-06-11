var Platform = (function createPlatform() {
  var hasCapacitor = typeof window !== 'undefined' && Boolean(window.Capacitor);
  var capacitor = hasCapacitor ? window.Capacitor : null;
  var preferences =
    typeof window !== 'undefined' && window.capacitorPreferences
      ? window.capacitorPreferences.Preferences
      : null;
  var share =
    typeof window !== 'undefined' && window.capacitorShare
      ? window.capacitorShare.Share
      : null;
  var clipboard =
    typeof window !== 'undefined' && window.capacitorClipboard
      ? window.capacitorClipboard.Clipboard
      : null;
  var http =
    typeof window !== 'undefined' && window.capacitorExports
      ? window.capacitorExports.CapacitorHttp
      : null;
  var platformName = hasCapacitor && typeof capacitor.getPlatform === 'function'
    ? capacitor.getPlatform()
    : 'web';

  function isNative() {
    return hasCapacitor && typeof capacitor.isNativePlatform === 'function'
      ? capacitor.isNativePlatform()
      : false;
  }

  async function configurePreferences() {
    if (!preferences || typeof preferences.configure !== 'function') return;
    await preferences.configure({ group: 'WriteCard' });
  }

  async function getPreference(key) {
    if (!preferences || typeof preferences.get !== 'function') {
      return localStorage.getItem(key);
    }

    var result = await preferences.get({ key: key });
    return result && typeof result.value === 'string' ? result.value : null;
  }

  async function setPreference(key, value) {
    if (!preferences || typeof preferences.set !== 'function') {
      localStorage.setItem(key, value);
      return;
    }

    await preferences.set({ key: key, value: value });
  }

  async function removePreference(key) {
    if (!preferences || typeof preferences.remove !== 'function') {
      localStorage.removeItem(key);
      return;
    }

    await preferences.remove({ key: key });
  }

  async function httpRequest(options) {
    if (http && typeof http.request === 'function') {
      return http.request(options);
    }

    var headers = options.headers || {};
    var method = options.method || 'GET';
    var url = options.url;
    var body = undefined;

    if (options.data !== undefined) {
      body = headers['Content-Type'] === 'application/json'
        ? JSON.stringify(options.data)
        : options.data;
    }

    var response = await fetch(url, {
      method: method,
      headers: headers,
      body: body,
    });

    var text = await response.text();
    var data = text;
    var contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    return {
      status: response.status,
      data: data,
      headers: {},
      url: response.url,
    };
  }

  async function shareText(title, text) {
    if (share && typeof share.share === 'function') {
      await share.share({ title: title, text: text });
      return true;
    }

    if (navigator.share) {
      await navigator.share({ title: title, text: text });
      return true;
    }

    await copyText(text);
    return false;
  }

  async function copyText(text) {
    if (clipboard && typeof clipboard.write === 'function') {
      await clipboard.write({
        string: text,
        label: 'WriteCard',
      });
      return true;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    var copied = false;
    try {
      copied = document.execCommand('copy');
    } finally {
      document.body.removeChild(textarea);
    }

    if (!copied) {
      throw new Error('复制失败');
    }

    return true;
  }

  return {
    name: platformName,
    isAndroidApp: platformName === 'android' && isNative(),
    isNativeApp: isNative(),
    isDesktopLocalServer: !(platformName === 'android' && isNative()),
    configurePreferences: configurePreferences,
    getPreference: getPreference,
    setPreference: setPreference,
    removePreference: removePreference,
    httpRequest: httpRequest,
    shareText: shareText,
    copyText: copyText,
  };
})();
