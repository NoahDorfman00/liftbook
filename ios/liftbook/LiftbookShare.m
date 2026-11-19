#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <LinkPresentation/LinkPresentation.h>
#import <UIKit/UIKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

// One share sheet, the right image per destination: Messages gets the 3:4
// card (it center-crops anything taller than ~4:3), everything else —
// Instagram stories, Photos, AirDrop — gets the 9:16 story.
//
// The caption + link that ride along are worded per destination: "Try it
// → <link>" in most apps, "Try it ↓ <link>" in Messages (it puts the link
// in its own bubble below the text).
//
// Apps that take the image but drop that text (story composers) get the
// story link — the App Store — on the clipboard instead, with a brief
// notice so the user knows to paste it into a link sticker. Neither
// Instagram nor Snapchat lets a third-party app attach a link to a story
// itself, and lift links are too long for Instagram's sticker.

// Share extensions report their bundle id as the activity type; these
// prefixes are the apps whose story composers drop shared text
static NSArray<NSString *> *LiftbookLinkDroppingApps(void)
{
  return @[
    @"com.burbn.instagram.",       // Instagram
    @"com.burbn.barcelona.",       // Threads
    @"com.toyopagroup.picaboo.",   // Snapchat
    @"com.zhiliaoapp.musically.",  // TikTok
    @"com.facebook.Facebook.",     // Facebook
  ];
}

// Snapchat's extension does nothing with a file URL (Photos works because
// it hands over image data), so it gets a decoded image instead
static BOOL LiftbookIsSnapchat(UIActivityType activityType)
{
  return [activityType hasPrefix:@"com.toyopagroup.picaboo."];
}

static BOOL LiftbookDropsText(UIActivityType activityType)
{
  for (NSString *prefix in LiftbookLinkDroppingApps()) {
    if ([activityType hasPrefix:prefix]) {
      return YES;
    }
  }
  return NO;
}

// The notice: a pill centered in the top half of the screen (right under
// the status bar it went unnoticed), in its own window above the share
// sheet and the extension's compose sheet, gone after a few seconds
static UIWindow *liftbookToastWindow;

static void LiftbookShowToast(UIWindowScene *scene, NSString *message)
{
  if (!scene) {
    return;
  }
  [liftbookToastWindow setHidden:YES];
  UIWindow *window = [[UIWindow alloc] initWithWindowScene:scene];
  window.windowLevel = UIWindowLevelAlert + 1;
  window.userInteractionEnabled = NO;
  window.backgroundColor = UIColor.clearColor;
  UIViewController *root = [UIViewController new];
  root.view.backgroundColor = UIColor.clearColor;
  window.rootViewController = root;

  UILabel *label = [UILabel new];
  label.text = message;
  label.font = [UIFont fontWithName:@"Schoolbell-Regular" size:23]
    ?: [UIFont fontWithName:@"Schoolbell" size:23]
    ?: [UIFont systemFontOfSize:18 weight:UIFontWeightSemibold];
  label.textColor = UIColor.whiteColor;
  label.textAlignment = NSTextAlignmentCenter;
  label.numberOfLines = 0;
  UIView *pill = [UIView new];
  pill.backgroundColor = [UIColor colorWithWhite:0.1 alpha:0.92];
  pill.layer.cornerRadius = 24;
  pill.translatesAutoresizingMaskIntoConstraints = NO;
  label.translatesAutoresizingMaskIntoConstraints = NO;
  [pill addSubview:label];
  [root.view addSubview:pill];
  [NSLayoutConstraint activateConstraints:@[
    [label.topAnchor constraintEqualToAnchor:pill.topAnchor constant:14],
    [label.bottomAnchor constraintEqualToAnchor:pill.bottomAnchor constant:-14],
    [label.leadingAnchor constraintEqualToAnchor:pill.leadingAnchor constant:24],
    [label.trailingAnchor constraintEqualToAnchor:pill.trailingAnchor constant:-24],
    [pill.centerXAnchor constraintEqualToAnchor:root.view.centerXAnchor],
    // centerY at a quarter of the screen height
    [NSLayoutConstraint constraintWithItem:pill attribute:NSLayoutAttributeCenterY relatedBy:NSLayoutRelationEqual
                                    toItem:root.view attribute:NSLayoutAttributeCenterY multiplier:0.5 constant:0],
    [pill.widthAnchor constraintLessThanOrEqualToAnchor:root.view.widthAnchor constant:-48],
  ]];

  pill.alpha = 0;
  window.hidden = NO;
  liftbookToastWindow = window;
  [UIView animateWithDuration:0.2 animations:^{
    pill.alpha = 1;
  } completion:^(BOOL finished) {
    [UIView animateWithDuration:0.3 delay:3.0 options:0 animations:^{
      pill.alpha = 0;
    } completion:^(BOOL done) {
      window.hidden = YES;
      if (liftbookToastWindow == window) {
        liftbookToastWindow = nil;
      }
    }];
  }];
}

@interface LiftbookShareImage : NSObject <UIActivityItemSource>
@property (nonatomic, strong) NSURL *story;
@property (nonatomic, strong) NSURL *message;
@property (nonatomic, copy) NSString *title;
@property (nonatomic, copy) NSString *storyLink;
@property (nonatomic, weak) UIWindowScene *scene;
@end

@implementation LiftbookShareImage

- (id)activityViewControllerPlaceholderItem:(UIActivityViewController *)controller
{
  return self.story;
}

// Asked once the user picks a destination, before it opens — the moment to
// put the story link on the clipboard for apps that will drop the text
- (id)activityViewController:(UIActivityViewController *)controller itemForActivityType:(UIActivityType)activityType
{
#if DEBUG
  NSLog(@"[LiftbookShare] activity type: %@", activityType);
#endif
  if (self.storyLink.length > 0 && activityType && LiftbookDropsText(activityType)) {
    NSString *link = self.storyLink;
    UIWindowScene *scene = self.scene;
    dispatch_async(dispatch_get_main_queue(), ^{
      NSURL *url = [NSURL URLWithString:link];
      NSMutableDictionary *item = [NSMutableDictionary dictionaryWithObject:link forKey:@"public.utf8-plain-text"];
      if (url) {
        item[@"public.url"] = url;
      }
      UIPasteboard.generalPasteboard.items = @[item];
      LiftbookShowToast(scene, @"Link copied! Paste it into a link sticker");
    });
  }
  if ([activityType isEqualToString:UIActivityTypeMessage]) {
    return self.message;
  }
  if (activityType && LiftbookIsSnapchat(activityType)) {
    return [UIImage imageWithContentsOfFile:self.story.path] ?: self.story;
  }
  return self.story;
}

// the sheet's header: the lift title and the image, not the temp file name
- (LPLinkMetadata *)activityViewControllerLinkMetadata:(UIActivityViewController *)controller
{
  LPLinkMetadata *metadata = [LPLinkMetadata new];
  metadata.title = self.title;
  NSItemProvider *image = [[NSItemProvider alloc] initWithContentsOfURL:self.story];
  metadata.iconProvider = image;
  metadata.imageProvider = image;
  return metadata;
}

@end

// The caption and link, worded for where they're going
@interface LiftbookShareText : NSObject <UIActivityItemSource>
@property (nonatomic, copy) NSString *caption;
@property (nonatomic, copy) NSString *link;
@end

@implementation LiftbookShareText

- (id)activityViewControllerPlaceholderItem:(UIActivityViewController *)controller
{
  return @"";
}

- (id)activityViewController:(UIActivityViewController *)controller itemForActivityType:(UIActivityType)activityType
{
  if (activityType && LiftbookDropsText(activityType)) {
    return nil; // dropped anyway; the story link is on the clipboard
  }
  NSString *arrow = [activityType isEqualToString:UIActivityTypeMessage] ? @"↓" : @"→";
  return [NSString stringWithFormat:@"%@ %@ %@", self.caption, arrow, self.link];
}

@end

@interface LiftbookShare : NSObject <RCTBridgeModule>
@end

// view-shot hands back plain paths ("/private/var/…/x.png"); accept file:// too
static NSURL *LiftbookFileURL(id value)
{
  if (![value isKindOfClass:[NSString class]] || [(NSString *)value length] == 0) {
    return nil;
  }
  NSString *string = value;
  NSURL *url = [string hasPrefix:@"file://"] ? [NSURL URLWithString:string] : [NSURL fileURLWithPath:string];
  return [[NSFileManager defaultManager] fileExistsAtPath:url.path] ? url : nil;
}

@implementation LiftbookShare

RCT_EXPORT_MODULE()

- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

// story/message: paths (or file URIs) of the captured PNGs; caption + link:
// sent with them; storyLink: copied for story composers, which drop text.
// Resolves with whether the user went through with a share.
RCT_EXPORT_METHOD(share:(NSDictionary *)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSURL *story = LiftbookFileURL(options[@"story"]);
  NSURL *message = LiftbookFileURL(options[@"message"]);
  if (!story || !message) {
    reject(@"share_no_image", @"Share image file not found", nil);
    return;
  }
  UIViewController *presenter = RCTPresentedViewController();
  if (!presenter) {
    reject(@"share_no_presenter", @"Nothing to present the share sheet from", nil);
    return;
  }

  LiftbookShareImage *image = [LiftbookShareImage new];
  image.story = story;
  image.message = message;
  image.title = options[@"title"] ?: @"liftbook";
  image.storyLink = [options[@"storyLink"] isKindOfClass:[NSString class]] ? options[@"storyLink"] : nil;
  image.scene = presenter.view.window.windowScene;
  NSMutableArray *items = [NSMutableArray arrayWithObject:image];
  if ([options[@"caption"] isKindOfClass:[NSString class]] && [options[@"link"] isKindOfClass:[NSString class]]) {
    LiftbookShareText *text = [LiftbookShareText new];
    text.caption = options[@"caption"];
    text.link = options[@"link"];
    [items addObject:text];
  }

  UIActivityViewController *sheet = [[UIActivityViewController alloc] initWithActivityItems:items applicationActivities:nil];
  // can fire more than once (backing out of an extension leaves the sheet up)
  __block BOOL settled = NO;
  sheet.completionWithItemsHandler = ^(UIActivityType activityType, BOOL completed, NSArray *returnedItems, NSError *error) {
    if (!settled) {
      settled = YES;
      resolve(@(completed));
    }
  };
  // iPad presents the sheet as a popover, which needs an anchor
  sheet.popoverPresentationController.sourceView = presenter.view;
  sheet.popoverPresentationController.sourceRect = CGRectMake(CGRectGetMidX(presenter.view.bounds), CGRectGetMidY(presenter.view.bounds), 0, 0);
  sheet.popoverPresentationController.permittedArrowDirections = 0;
  [presenter presentViewController:sheet animated:YES completion:nil];
}

@end

// --- Backup files ------------------------------------------------------------
// Moving lifts between phones (backup.ts): share the whole history as one
// `.liftbook` file, pick one from Files, and read one the app was handed.
// The type (com.noahdorfman.liftbook.backup) is declared in Info.plist, so
// AirDropping such a file opens the app with its URL.

// A backup is a few hundred KB at most; refuse anything absurd rather than
// pull it into memory
static const unsigned long long LiftbookBackupMaxBytes = 50ull * 1024 * 1024;

// LiftbookIncomingFile (AppDelegate.swift), looked up by name
@protocol LiftbookIncomingFileSource
+ (nullable NSString *)takePendingURL;
@end

@interface LiftbookBackup : NSObject <RCTBridgeModule, UIDocumentPickerDelegate>
@property (nonatomic, copy) RCTPromiseResolveBlock pickResolve;
@end

@implementation LiftbookBackup

RCT_EXPORT_MODULE()

- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

// Writes the backup to a temp file and opens the share sheet with it.
// Resolves with whether the user went through with a share.
RCT_EXPORT_METHOD(exportFile:(NSString *)fileName
                  contents:(NSString *)contents
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  UIViewController *presenter = RCTPresentedViewController();
  if (!presenter) {
    reject(@"backup_no_presenter", @"Nothing to present the share sheet from", nil);
    return;
  }
  // its own directory, so the file keeps its exact name (that's what the
  // recipient sees) without colliding with an earlier export
  NSString *name = fileName.lastPathComponent.length > 0 ? fileName.lastPathComponent : @"Liftbook backup.liftbook";
  NSURL *directory = [[NSURL fileURLWithPath:NSTemporaryDirectory()] URLByAppendingPathComponent:@"liftbook-backup" isDirectory:YES];
  NSFileManager *files = [NSFileManager defaultManager];
  [files removeItemAtURL:directory error:nil];
  NSError *error = nil;
  if (![files createDirectoryAtURL:directory withIntermediateDirectories:YES attributes:nil error:&error]) {
    reject(@"backup_write_failed", @"Couldn't write the backup file", error);
    return;
  }
  NSURL *file = [directory URLByAppendingPathComponent:name];
  if (![contents writeToURL:file atomically:YES encoding:NSUTF8StringEncoding error:&error]) {
    reject(@"backup_write_failed", @"Couldn't write the backup file", error);
    return;
  }

  UIActivityViewController *sheet = [[UIActivityViewController alloc] initWithActivityItems:@[file] applicationActivities:nil];
  // can fire more than once (backing out of an extension leaves the sheet up)
  __block BOOL settled = NO;
  sheet.completionWithItemsHandler = ^(UIActivityType activityType, BOOL completed, NSArray *returnedItems, NSError *shareError) {
    if (!settled) {
      settled = YES;
      resolve(@(completed));
    }
  };
  // iPad presents the sheet as a popover, which needs an anchor
  sheet.popoverPresentationController.sourceView = presenter.view;
  sheet.popoverPresentationController.sourceRect = CGRectMake(CGRectGetMidX(presenter.view.bounds), CGRectGetMidY(presenter.view.bounds), 0, 0);
  sheet.popoverPresentationController.permittedArrowDirections = 0;
  [presenter presentViewController:sheet animated:YES completion:nil];
}

// Opens the Files picker. Resolves with the URL of a copy of the chosen
// file, or null if the user backed out. Besides backups it offers JSON and
// plain text, for a file whose name got mangled on the way over — the
// import screen rejects anything that isn't a backup.
RCT_EXPORT_METHOD(pickFile:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  UIViewController *presenter = RCTPresentedViewController();
  if (!presenter) {
    reject(@"backup_no_presenter", @"Nothing to present the file picker from", nil);
    return;
  }
  if (self.pickResolve) {
    self.pickResolve([NSNull null]);
    self.pickResolve = nil;
  }
  NSMutableArray<UTType *> *types = [NSMutableArray array];
  UTType *backup = [UTType typeWithIdentifier:@"com.noahdorfman.liftbook.backup"];
  if (backup) {
    [types addObject:backup];
  }
  [types addObject:UTTypeJSON];
  [types addObject:UTTypePlainText];
  UIDocumentPickerViewController *picker = [[UIDocumentPickerViewController alloc] initForOpeningContentTypes:types asCopy:YES];
  picker.delegate = self;
  picker.allowsMultipleSelection = NO;
  self.pickResolve = resolve;
  [presenter presentViewController:picker animated:YES completion:nil];
}

- (void)documentPicker:(UIDocumentPickerViewController *)controller didPickDocumentsAtURLs:(NSArray<NSURL *> *)urls
{
  RCTPromiseResolveBlock resolve = self.pickResolve;
  self.pickResolve = nil;
  if (resolve) {
    resolve(urls.firstObject.absoluteString ?: (id)[NSNull null]);
  }
}

- (void)documentPickerWasCancelled:(UIDocumentPickerViewController *)controller
{
  RCTPromiseResolveBlock resolve = self.pickResolve;
  self.pickResolve = nil;
  if (resolve) {
    resolve([NSNull null]);
  }
}

// A backup file iOS handed the app that JavaScript hasn't seen yet — the
// one the app was launched with, or one that arrived before it was
// listening. Resolves with its URL once, then null.
RCT_EXPORT_METHOD(takeIncomingFile:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  Class<LiftbookIncomingFileSource> incoming = (Class<LiftbookIncomingFileSource>)NSClassFromString(@"LiftbookIncomingFile");
  resolve([incoming takePendingURL] ?: (id)[NSNull null]);
}

// Reads a picked or opened file as text. The app only ever holds a copy
// (the picker's, or the one iOS drops in Documents/Inbox), so the copy is
// deleted once read rather than left to pile up.
RCT_EXPORT_METHOD(readFile:(NSString *)urlString
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSURL *url = [urlString hasPrefix:@"file://"] ? [NSURL URLWithString:urlString] : nil;
  if (!url || !url.isFileURL) {
    reject(@"backup_read_failed", @"Not a file", nil);
    return;
  }
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    BOOL scoped = [url startAccessingSecurityScopedResource];
    NSError *error = nil;
    NSString *contents = nil;
    NSNumber *size = nil;
    [url getResourceValue:&size forKey:NSURLFileSizeKey error:nil];
    if (size && size.unsignedLongLongValue > LiftbookBackupMaxBytes) {
      error = [NSError errorWithDomain:NSCocoaErrorDomain code:NSFileReadTooLargeError userInfo:nil];
    } else {
      contents = [NSString stringWithContentsOfURL:url encoding:NSUTF8StringEncoding error:&error];
    }
    if (scoped) {
      [url stopAccessingSecurityScopedResource];
    }

    // only ever delete the app's own copies
    NSString *path = url.URLByStandardizingPath.URLByResolvingSymlinksInPath.path;
    NSString *temp = [NSURL fileURLWithPath:NSTemporaryDirectory()].URLByResolvingSymlinksInPath.path;
    NSString *documents = [[NSFileManager defaultManager] URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask].firstObject.URLByResolvingSymlinksInPath.path;
    NSString *inbox = documents ? [documents stringByAppendingPathComponent:@"Inbox"] : nil;
    if ((temp && [path hasPrefix:[temp stringByAppendingString:@"/"]]) ||
        (inbox && [path hasPrefix:[inbox stringByAppendingString:@"/"]])) {
      [[NSFileManager defaultManager] removeItemAtPath:path error:nil];
    }

    if (contents) {
      resolve(contents);
    } else {
      reject(@"backup_read_failed", @"Couldn't read the file", error);
    }
  });
}

@end
