/**
 * WriteCard Update Checker
 * Checks GitHub Releases for new APK versions and handles download/install.
 *
 * Configuration: Set GITHUB_OWNER and GITHUB_REPO below to your GitHub repository.
 * Tag format: v1.0, v1.1, v2.0, etc.
 */
var UpdateChecker = (function createUpdateChecker() {
  // ===== Configuration - change these to match your GitHub repo =====
  var GITHUB_OWNER = 'kilng235';
  var GITHUB_REPO = 'write-card';
  // ===================================================================

  var GITHUB_API = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/releases/latest';
  var CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours between checks

  var updateManager = null;
  if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins) {
    updateManager = window.Capacitor.Plugins.UpdateManager || null;
  }

  /**
   * Parse a version string like "1.2.3" or "v1.2" into a comparable numeric code.
   * Normalizes to 3 segments: "1.2" → "1.2.0" → 10200
   */
  function parseVersionCode(versionStr) {
    if (!versionStr) return 0;
    var cleaned = String(versionStr).replace(/^v/i, '').trim();
    var parts = cleaned.split('.').map(function toNum(s) {
      return parseInt(s, 10) || 0;
    });
    while (parts.length < 3) parts.push(0);
    return parts[0] * 10000 + parts[1] * 100 + parts[2];
  }

  /**
   * Get the current app version from the native plugin.
   */
  async function getCurrentVersion() {
    if (!updateManager || typeof updateManager.getVersionInfo !== 'function') {
      return null;
    }
    try {
      var info = await updateManager.getVersionInfo();
      return {
        versionName: info.versionName,
        versionCode: Number(info.versionCode),
      };
    } catch (e) {
      console.warn('[UpdateChecker] Failed to get current version:', e);
      return null;
    }
  }

  /**
   * Query GitHub Releases API for the latest release.
   */
  async function fetchLatestRelease() {
    try {
      var resp = await fetch(GITHUB_API, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      });
      if (!resp.ok) {
        if (resp.status === 404) {
          console.info('[UpdateChecker] No releases found on GitHub.');
          return null;
        }
        console.warn('[UpdateChecker] GitHub API returned', resp.status);
        return null;
      }
      return await resp.json();
    } catch (e) {
      console.warn('[UpdateChecker] Failed to fetch release:', e);
      return null;
    }
  }

  /**
   * Find the APK asset in a GitHub release.
   */
  function findApkAsset(release) {
    if (!release || !release.assets) return null;
    for (var i = 0; i < release.assets.length; i++) {
      var asset = release.assets[i];
      if (asset.name && asset.name.toLowerCase().endsWith('.apk')) {
        return asset;
      }
    }
    return null;
  }

  /**
   * Check if a new version is available.
   * Returns: { hasUpdate, latestVersion, downloadUrl, releaseNotes, assetName } or null.
   */
  async function checkForUpdate() {
    if (!Platform.isAndroidApp) {
      return null; // Only check on Android app
    }

    var current = await getCurrentVersion();
    if (!current) return null;

    var release = await fetchLatestRelease();
    if (!release) return null;

    var asset = findApkAsset(release);
    if (!asset) {
      console.info('[UpdateChecker] No APK asset found in latest release.');
      return null;
    }

    var latestTagName = release.tag_name || '';
    var latestCode = parseVersionCode(latestTagName);
    var currentCode = parseVersionCode(current.versionName);

    if (latestCode > currentCode) {
      return {
        hasUpdate: true,
        currentVersion: current.versionName,
        latestVersion: latestTagName.replace(/^v/i, ''),
        downloadUrl: asset.browser_download_url,
        assetName: asset.name,
        assetSize: asset.size,
        releaseNotes: release.body || '',
        publishedAt: release.published_at || '',
      };
    }

    return { hasUpdate: false };
  }

  /**
   * Trigger the APK download and installation via native plugin.
   */
  async function startUpdate(downloadUrl) {
    if (!updateManager || typeof updateManager.downloadAndInstallApk !== 'function') {
      throw new Error('Update plugin not available');
    }
    return await updateManager.downloadAndInstallApk({ url: downloadUrl });
  }

  /**
   * Check if enough time has passed since the last check.
   */
  async function shouldCheck() {
    try {
      var lastCheck = await Platform.getPreference('update_last_check');
      if (!lastCheck) return true;
      var elapsed = Date.now() - parseInt(lastCheck, 10);
      return elapsed > CHECK_INTERVAL_MS;
    } catch (e) {
      return true;
    }
  }

  /**
   * Record that we just checked for updates.
   */
  async function recordCheck() {
    try {
      await Platform.setPreference('update_last_check', String(Date.now()));
    } catch (e) {
      // ignore
    }
  }

  /**
   * Full update check flow: check, show dialog if update available.
   */
  async function checkAndPrompt() {
    if (!Platform.isAndroidApp) return;

    var should = await shouldCheck();
    if (!should) return;

    await recordCheck();

    var result;
    try {
      result = await checkForUpdate();
    } catch (e) {
      console.warn('[UpdateChecker] Check failed:', e);
      return;
    }

    if (!result || !result.hasUpdate) return;

    showUpdateDialog(result);
  }

  /**
   * Show the update confirmation dialog.
   */
  function showUpdateDialog(info) {
    var modal = document.getElementById('update-modal');
    if (!modal) return;

    var versionEl = document.getElementById('update-version');
    var notesEl = document.getElementById('update-notes');
    var sizeEl = document.getElementById('update-size');

    if (versionEl) {
      versionEl.textContent = 'v' + info.latestVersion;
    }

    if (sizeEl) {
      var sizeMB = (info.assetSize / (1024 * 1024)).toFixed(1);
      sizeEl.textContent = info.assetName + ' (' + sizeMB + ' MB)';
    }

    if (notesEl) {
      if (info.releaseNotes) {
        notesEl.textContent = info.releaseNotes;
        notesEl.style.display = 'block';
      } else {
        notesEl.style.display = 'none';
      }
    }

    // Bind update button
    var updateBtn = document.getElementById('btn-do-update');
    var newBtn = updateBtn.cloneNode(true);
    updateBtn.parentNode.replaceChild(newBtn, updateBtn);
    newBtn.id = 'btn-do-update';
    newBtn.addEventListener('click', async function onUpdate() {
      newBtn.disabled = true;
      newBtn.textContent = '正在下载...';
      try {
        await startUpdate(info.downloadUrl);
        closeUpdateModal();
      } catch (e) {
        newBtn.disabled = false;
        newBtn.textContent = '立即更新';
        alert('更新失败：' + e.message);
      }
    });

    modal.style.display = 'flex';
  }

  function closeUpdateModal() {
    var modal = document.getElementById('update-modal');
    if (modal) modal.style.display = 'none';
  }

  return {
    checkForUpdate: checkForUpdate,
    checkAndPrompt: checkAndPrompt,
    startUpdate: startUpdate,
    showUpdateDialog: showUpdateDialog,
    closeUpdateModal: closeUpdateModal,
    parseVersionCode: parseVersionCode,
  };
})();

// Global function for HTML onclick
function closeUpdateModal() {
  UpdateChecker.closeUpdateModal();
}
