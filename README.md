# WriteCard
测试性质的写卡软件，建议在模拟器上测试运行。

WriteCard is a local writing-card tool with two distribution modes:
- `Windows EXE`: starts a local Node/Express service and opens the browser automatically.
- `Android APK`: runs inside a Capacitor WebView and calls the model API directly from the phone.
This is a local tool, not a hosted SaaS. Your API key is not shared with other users.
## Security Boundary
### Windows EXE
- API keys are stored in the current Windows user directory.
- The browser UI does not persist real keys in `localStorage`.
- Frontend requests do not send your real key directly; the local server handles upstream requests.
### Android APK
- API keys are stored only on the phone through local app storage.
- The app sends requests directly to the API base URL the user enters.
- The key does not go to any author-controlled server.
- The Android first version does not try to hide the key from the page layer; the security boundary is device-local storage plus direct-to-model requests.
## Windows Usage
1. Download the Windows release folder.
2. Double-click `write-card.exe`.
3. Your browser will open the local page automatically.
4. Open `Settings` and fill in your own `API Base URL`, `API Key`, and model.
Local Windows data paths:
- `%APPDATA%\WriteCard\config.json`
- `%APPDATA%\WriteCard\logs\`
## Android Usage
1. Install the APK on your Android device.
2. Open the app.
3. In `Settings`, fill in your own `API Base URL`, `API Key`, and model.
4. Use chat, preset modules, YAML preview, and novel extraction directly in the app.
Android first-version scope:
- Included: chat, preset selection, settings persistence, novel paste/import, worldview extraction, main-character extraction, YAML preview/share.
- Deferred: image vision workflow is not included in the Android first version.
## Developer Run
Install dependencies, then run either:
```bash
npm start
```
or:
```bash
npm run launch
```
## Windows Build
Prepare the release folder:
```bash
npm run prepare:release
```
Build the EXE:
```bash
npm run build:exe
```
Full Windows release flow:
```bash
npm run build:release
```
## Android Build
Sync Capacitor browser assets:
```bash
npm run sync:capacitor-assets
```
Sync the Android project:
```bash
npm run android:sync
```
Open the Android project in Android Studio:
```bash
npm run android:open
```
Try building a debug APK from the command line:
```bash
npm run build:apk
```
If the local machine does not have a ready Android SDK / Java / Gradle environment, open the generated `android/` project in Android Studio and finish the SDK setup there.
## Project Notes
- `public/` is the shared frontend for both Windows and Android.
- Desktop keeps the `/api/*` local-server route flow.
- Android uses a platform adapter:
  - config stored locally
  - preset loaded from packaged static assets
  - model requests sent directly with Capacitor-compatible HTTP
## Release Hygiene
Do not ship personal files such as:
- `.server-config.json`
- `.codex-server.*.log`
- local debug logs
- user-specific API keys or config exports