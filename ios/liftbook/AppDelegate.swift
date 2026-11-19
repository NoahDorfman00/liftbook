import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

// The app uses the UIScene lifecycle: iOS 27 traps at launch for apps built
// with the current SDK that haven't adopted it
// (_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption). The app
// delegate owns the React Native factory; SceneDelegate creates the window.
@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  // Set by SceneDelegate. React Native still reads
  // UIApplication.shared.delegate.window (RCTDeviceInfo's orientation
  // handler, LogBox) — without this property that's an unrecognized
  // selector crash when the app goes inactive and back.
  var window: UIWindow?
  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    return true
  }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard
      let windowScene = scene as? UIWindowScene,
      let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let factory = appDelegate.reactNativeFactory
    else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    factory.startReactNative(
      withModuleName: "liftbook",
      in: window,
      launchOptions: Self.launchOptions(from: connectionOptions)
    )
  }

  // A link that cold-launches the app arrives in the scene's connection
  // options, but React Native's Linking.getInitialURL() reads launchOptions —
  // rebuild the two entries it looks for (custom-scheme URL, universal link)
  private static func launchOptions(
    from connectionOptions: UIScene.ConnectionOptions
  ) -> [UIApplication.LaunchOptionsKey: Any] {
    var options: [UIApplication.LaunchOptionsKey: Any] = [:]
    if let context = connectionOptions.urlContexts.first {
      options[.url] = LiftbookIncomingFile.localURL(for: context)
    }
    if let activity = connectionOptions.userActivities.first(where: {
      $0.activityType == NSUserActivityTypeBrowsingWeb
    }) {
      options[.userActivityDictionary] = [
        UIApplication.LaunchOptionsKey.userActivityType.rawValue: activity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": activity,
      ]
    }
    return options
  }

  // Handle custom URL scheme (liftbook://) and opened backup files while running
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      let url = LiftbookIncomingFile.localURL(for: context)
      _ = RCTLinkingManager.application(UIApplication.shared, open: url, options: [:])
    }
  }

  // Handle universal links (https://liftbookapp.com) while running
  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = RCTLinkingManager.application(
      UIApplication.shared,
      continue: userActivity,
      restorationHandler: { _ in }
    )
  }
}

// A backup file handed to the app (tapped in Files, "Open With", the share
// sheet, AirDrop). Two things can go wrong between iOS and JavaScript:
//  - a file opened in place is only readable through the URL object iOS
//    passed in; the string that reaches JavaScript has lost that access.
//    So it's copied into tmp here, and JavaScript gets the copy.
//  - React Native drops a URL that arrives before JavaScript is listening
//    (cold launch). So the latest file is also parked here, and JavaScript
//    asks for it when it starts (LiftbookBackup.takeIncomingFile in
//    LiftbookShare.m, which finds this class by name).
@objc(LiftbookIncomingFile)
class LiftbookIncomingFile: NSObject {
  private static let lock = NSLock()
  private static var pending: String?

  // The URL to pass on to React Native: unchanged for links, a readable
  // local file for files
  static func localURL(for context: UIOpenURLContext) -> URL {
    let url = context.url
    guard url.isFileURL else { return url }
    let local = context.options.openInPlace ? (copyToTemp(url) ?? url) : url
    lock.lock()
    pending = local.absoluteString
    lock.unlock()
    return local
  }

  // The parked file URL, if any; hands it out once
  @objc static func takePendingURL() -> String? {
    lock.lock()
    defer { lock.unlock() }
    let url = pending
    pending = nil
    return url
  }

  private static func copyToTemp(_ url: URL) -> URL? {
    let scoped = url.startAccessingSecurityScopedResource()
    defer {
      if scoped { url.stopAccessingSecurityScopedResource() }
    }
    let files = FileManager.default
    // its own directory, so the copy keeps the file's name
    let directory = files.temporaryDirectory
      .appendingPathComponent("liftbook-incoming", isDirectory: true)
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    let copy = directory.appendingPathComponent(url.lastPathComponent)
    var copied = false
    var coordinationError: NSError?
    NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) { readable in
      do {
        try files.createDirectory(at: directory, withIntermediateDirectories: true)
        try files.copyItem(at: readable, to: copy)
        copied = true
      } catch {
        copied = false
      }
    }
    return copied ? copy : nil
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
