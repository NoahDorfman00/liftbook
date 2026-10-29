#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <LinkPresentation/LinkPresentation.h>
#import <UIKit/UIKit.h>

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

// The notice: a pill near the top of the screen, in its own window above the
// share sheet and the extension's compose sheet, gone after a few seconds
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
  label.font = [UIFont fontWithName:@"Schoolbell-Regular" size:20]
    ?: [UIFont fontWithName:@"Schoolbell" size:20]
    ?: [UIFont systemFontOfSize:16 weight:UIFontWeightSemibold];
  label.textColor = UIColor.whiteColor;
  label.textAlignment = NSTextAlignmentCenter;
  label.numberOfLines = 0;
  UIView *pill = [UIView new];
  pill.backgroundColor = [UIColor colorWithWhite:0.1 alpha:0.92];
  pill.layer.cornerRadius = 20;
  pill.translatesAutoresizingMaskIntoConstraints = NO;
  label.translatesAutoresizingMaskIntoConstraints = NO;
  [pill addSubview:label];
  [root.view addSubview:pill];
  [NSLayoutConstraint activateConstraints:@[
    [label.topAnchor constraintEqualToAnchor:pill.topAnchor constant:10],
    [label.bottomAnchor constraintEqualToAnchor:pill.bottomAnchor constant:-10],
    [label.leadingAnchor constraintEqualToAnchor:pill.leadingAnchor constant:20],
    [label.trailingAnchor constraintEqualToAnchor:pill.trailingAnchor constant:-20],
    [pill.centerXAnchor constraintEqualToAnchor:root.view.centerXAnchor],
    [pill.topAnchor constraintEqualToAnchor:root.view.safeAreaLayoutGuide.topAnchor constant:8],
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
