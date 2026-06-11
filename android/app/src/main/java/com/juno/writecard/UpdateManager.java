package com.juno.writecard;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "UpdateManager")
public class UpdateManager extends Plugin {

    private static final String APK_NAME = "update.apk";
    private static final String PREFS_NAME = "writecard_update";
    private static final String KEY_DOWNLOAD_ID = "download_id";

    private BroadcastReceiver downloadReceiver;

    @PluginMethod
    public void getVersionInfo(PluginCall call) {
        try {
            PackageInfo pInfo = getContext().getPackageManager()
                    .getPackageInfo(getContext().getPackageName(), 0);
            JSObject result = new JSObject();
            result.put("versionName", pInfo.versionName);
            result.put("versionCode", (long) pInfo.getLongVersionCode());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to get version info: " + e.getMessage());
        }
    }

    @PluginMethod
    public void downloadAndInstallApk(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Download URL is required");
            return;
        }

        // Clean up any previous download
        cleanupPreviousDownload();

        try {
            File apkFile = new File(getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), APK_NAME);
            if (apkFile.exists()) {
                apkFile.delete();
            }

            DownloadManager dm = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle("WriteCard Update");
            request.setDescription("Downloading new version...");
            request.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, APK_NAME);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);

            long downloadId = dm.enqueue(request);

            // Save download ID for recovery if app restarts
            getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putLong(KEY_DOWNLOAD_ID, downloadId)
                    .apply();

            // Register receiver for auto-install when download completes
            registerDownloadReceiver(dm, downloadId);

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("message", "Download started");
            call.resolve(result);

        } catch (Exception e) {
            call.reject("Failed to start download: " + e.getMessage());
        }
    }

    private void registerDownloadReceiver(DownloadManager dm, long downloadId) {
        // Unregister previous receiver if any
        unregisterDownloadReceiver();

        downloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (id != downloadId) return;

                // Query download status
                DownloadManager.Query query = new DownloadManager.Query();
                query.setFilterById(downloadId);
                Cursor cursor = dm.query(query);

                if (cursor != null && cursor.moveToFirst()) {
                    int statusIdx = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                    int status = cursor.getInt(statusIdx);
                    cursor.close();

                    if (status == DownloadManager.STATUS_SUCCESSFUL) {
                        installDownloadedApk();
                    }
                }
            }
        };

        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(downloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(downloadReceiver, filter);
        }
    }

    private void unregisterDownloadReceiver() {
        if (downloadReceiver != null) {
            try {
                getContext().unregisterReceiver(downloadReceiver);
            } catch (IllegalArgumentException ignored) {
                // Receiver was already unregistered
            }
            downloadReceiver = null;
        }
    }

    private void installDownloadedApk() {
        try {
            File apkFile = new File(getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), APK_NAME);
            if (!apkFile.exists()) return;

            Uri apkUri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    apkFile
            );

            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(installIntent);
        } catch (Exception e) {
            Logger.error("Failed to launch APK installer: " + e.getMessage(), e);
        }
    }

    private void cleanupPreviousDownload() {
        unregisterDownloadReceiver();

        long prevId = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getLong(KEY_DOWNLOAD_ID, -1);
        if (prevId != -1) {
            DownloadManager dm = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            dm.remove(prevId);
        }
    }

    @Override
    protected void handleOnDestroy() {
        unregisterDownloadReceiver();
        super.handleOnDestroy();
    }
}
