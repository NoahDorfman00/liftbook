You are auditing the **Liftbook** app for Apple App Store submission readiness. Liftbook is a React Native 0.80 workout/lifting tracker with a notebook-style UI. It stores data locally via AsyncStorage, has no accounts/auth, no IAP, no analytics, and no cloud sync (Firebase is configured but inactive).

Run through EVERY section below. For each check, read the actual files and verify the current state. Report a clear **PASS**, **FAIL**, or **WARN** for each item, with specific remediation steps for any non-passing item.

---

## 1. APP METADATA & IDENTITY

Read `app.json`, `package.json`, and `ios/liftbook/Info.plist`.

- [ ] **Bundle Identifier** — Confirm `CFBundleIdentifier` is set to a real reverse-domain ID (not `org.reactjs.native.example.*`)
- [ ] **App Version** — `CFBundleShortVersionString` should be a proper semver (e.g., `1.0.0`), not `1.0` or `0.0.1`
- [ ] **Build Number** — `CFBundleVersion` must be a positive integer or semver, and must increment on each submission
- [ ] **Display Name** — `CFBundleDisplayName` should be title-cased and finalized (e.g., "Liftbook" not "liftbook")
- [ ] **Supported Orientations** — Verify `UISupportedInterfaceOrientations` matches actual UI behavior (portrait-only for phone is fine, but confirm iPad orientations if Universal)

## 2. ICONS & LAUNCH SCREEN

Read `ios/liftbook/Images.xcassets/AppIcon.appiconset/Contents.json` and inspect splash config.

- [ ] **App Icon Set Complete** — All required sizes present in the asset catalog (1024x1024 App Store icon is mandatory). No placeholder/blank icons.
- [ ] **No Alpha Channel on 1024x1024** — The App Store icon MUST NOT contain transparency/alpha. Check if the icon PNG has alpha.
- [ ] **Launch Screen** — Verify BootSplash.storyboard or LaunchScreen.storyboard is properly configured and referenced in Info.plist (`UILaunchStoryboardName`)
- [ ] **No "React Native" Default Splash** — Confirm the launch screen is custom, not the default RN splash

## 3. PRIVACY & PERMISSIONS

Read `ios/liftbook/PrivacyInfo.xcprivacy`, `Info.plist`, and scan source code for permission APIs.

- [ ] **PrivacyInfo.xcprivacy Present** — Required since Spring 2024. Must exist and declare all required reason APIs.
- [ ] **Privacy Manifest Accuracy** — Each `NSPrivacyAccessedAPIType` must have a valid reason string. Cross-check against actual API usage in code (UserDefaults, file timestamp, boot time).
- [ ] **NSPrivacyCollectedDataTypes** — If truly no data is collected, confirm this is empty array. If Firebase or Anthropic SDK sends any telemetry, it must be declared.
- [ ] **NSPrivacyTracking = false** — Confirm no ATT framework usage and tracking is declared false.
- [ ] **No Undeclared Permissions** — Scan for any usage of Camera, Photos, HealthKit, Location, Notifications, Contacts, etc. If found, corresponding `NS*UsageDescription` keys must be in Info.plist.
- [ ] **No Unused Permission Strings** — If Info.plist declares `NSCameraUsageDescription` etc. but the app never uses it, Apple may reject. Remove unused.

## 4. NETWORK & TRANSPORT SECURITY

Read Info.plist ATS settings and scan code for network calls.

- [ ] **App Transport Security** — `NSAllowsArbitraryLoads` should be `false` for production. `NSAllowsLocalNetworking` should be `false` or removed for release builds (it's a debug convenience).
- [ ] **No HTTP Calls** — Scan all source files for `http://` URLs (non-HTTPS). Any found must be justified or removed.
- [ ] **Firebase Config** — Even if unused, the Firebase SDK may make network calls on init. Verify Firebase is not initialized in production, or if it is, that it's declared in privacy manifest.
- [ ] **Anthropic SDK** — Check if the Anthropic SDK is imported/initialized. If it makes any network calls, the API key must not be hardcoded and the network usage must be declared.

## 5. CODE & BUILD HYGIENE

Scan source files for common rejection triggers.

- [ ] **No Private API Usage** — Search for any usage of undocumented Apple APIs (e.g., `UIStatusBar` private methods, `_` prefixed ObjC methods in native modules)
- [ ] **No Debug/Dev Code in Production** — Check for: `console.log` statements (excessive logging), hardcoded `localhost` or `127.0.0.1` URLs, debug flags, flipper references that should be stripped
- [ ] **No Hardcoded API Keys** — Scan all `.ts`, `.tsx`, `.js` files for hardcoded API keys, secrets, or credentials. `.env` should be gitignored and not bundled.
- [ ] **New Architecture Compatibility** — `RCTNewArchEnabled` is true. Verify all native dependencies support Fabric/TurboModules. Check for known incompatible libraries.
- [ ] **No Unused Native Permissions in Podfile/Entitlements** — Check that no capabilities are enabled in Xcode entitlements that aren't used

## 6. ASSET SIZE & PERFORMANCE

- [ ] **Large Image Assets** — Check for oversized PNGs in `/assets/`. Images like `trash.png` (1.2MB) and `profile.png` (745KB) for simple icons are red flags for both review and performance. Recommend optimizing to <100KB each.
- [ ] **App Binary Size** — If a production IPA/archive has been built, check its size. Apps over 200MB require Wi-Fi to download. For a simple tracker, target <30MB.
- [ ] **Bundle Analysis** — Check if any unnecessarily large dependencies are included (e.g., full Firebase SDK when only Realtime Database is used)

## 7. USER EXPERIENCE (COMMON REJECTION REASONS)

- [ ] **Minimum Functionality** — Apple requires apps provide enough value. Verify: the app has at least a core workflow (create lift -> add movements -> save -> view history -> view charts). Describe the complete user journey.
- [ ] **Empty State Handling** — When there are zero lifts, does the app show a helpful empty state (not a blank screen)? Check `LiftPreviewListScreen.tsx` for empty state UI.
- [ ] **Error Handling** — Verify error boundaries exist. Check what happens if AsyncStorage fails. No raw error screens shown to users.
- [ ] **No Broken Features** — If Firebase sync UI exists but doesn't work, or if there's a profile button that leads nowhere, these will cause rejection. Scan for dead-end UI elements.
- [ ] **No Placeholder Content** — Search for "lorem ipsum", "TODO", "test", "placeholder", "coming soon" in user-visible strings
- [ ] **Crash-Free Launch** — Confirm no obvious crash paths on launch (null checks on initial data load, etc.)

## 8. iOS-SPECIFIC REQUIREMENTS

- [ ] **iPad Support** — If the app declares iPad support in `UISupportedInterfaceOrientations~ipad`, the UI must actually work on iPad. If not supporting iPad, ensure it's iPhone-only in Xcode target settings.
- [ ] **Safe Area Handling** — Verify `SafeAreaView` or equivalent is used for notch/Dynamic Island devices
- [ ] **Dark Mode** — If the app responds to system dark mode, verify it looks correct. If it forces a color scheme, that's fine but should be intentional.
- [ ] **Minimum iOS Version** — Check deployment target. Should be iOS 15+ minimum for current App Store standards.

## 9. LEGAL & COMPLIANCE

- [ ] **No GDPR/Privacy Issues** — Even with local-only data, if the app will be available in the EU, check for compliance. Since no data leaves the device and there's no tracking, this is likely fine, but confirm.
- [ ] **License Compliance** — Check that all open-source dependencies have compatible licenses (MIT, Apache, BSD are fine; GPL can be problematic). Look at `package.json` dependencies.
- [ ] **Font Licensing** — `Schoolbell-Regular.ttf` must be properly licensed for mobile app distribution. Verify its license (it's a Google Font, which is OFL — confirm this is acceptable).

## 10. APP STORE CONNECT PREPARATION

These can't be verified in code but remind the developer:

- [ ] **Screenshots** — Need 6.7" (iPhone 15 Pro Max), 6.5" (iPhone 11 Pro Max), and 12.9" (iPad Pro) if supporting iPad. At least 1 screenshot required per size class.
- [ ] **App Description** — Prepare a compelling description. Suggest one based on the app's features.
- [ ] **Keywords** — Suggest relevant ASO keywords based on the app's functionality.
- [ ] **Privacy Policy URL** — Required for all apps. Even for local-only data, a simple privacy policy page is needed.
- [ ] **Support URL** — Required. Can be a simple webpage or GitHub repo.
- [ ] **Age Rating** — This app has no objectionable content. Recommend: 4+ rating.
- [ ] **Category** — Recommend: Health & Fitness (primary), Lifestyle (secondary)

---

## OUTPUT FORMAT

After checking everything, produce:

### Summary Scorecard
| Category | Pass | Warn | Fail |
|----------|------|------|------|

### Critical Blockers (Must Fix Before Submission)
Numbered list of FAIL items with exact file paths and remediation steps.

### Warnings (Recommended Fixes)
Numbered list of WARN items with reasoning.

### App Store Connect Checklist
Checklist of non-code items to prepare.

### Suggested App Description
Write a draft App Store description based on the app's actual features.

### Suggested Keywords
Comma-separated keyword list for ASO.
