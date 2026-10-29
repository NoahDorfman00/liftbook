#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <LinkPresentation/LinkPresentation.h>
#import <UIKit/UIKit.h>

// One share sheet, the right image per destination: Messages gets the 3:4
// card (it center-crops anything taller than ~4:3), everything else —
// Instagram stories, Photos, AirDrop — gets the 9:16 story.

@interface LiftbookShareImage : NSObject <UIActivityItemSource>
@property (nonatomic, strong) NSURL *story;
@property (nonatomic, strong) NSURL *message;
@property (nonatomic, copy) NSString *title;
@end

@implementation LiftbookShareImage

- (id)activityViewControllerPlaceholderItem:(UIActivityViewController *)controller
{
  return self.story;
}

- (id)activityViewController:(UIActivityViewController *)controller itemForActivityType:(UIActivityType)activityType
{
  return [activityType isEqualToString:UIActivityTypeMessage] ? self.message : self.story;
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

// story/message: paths (or file URIs) of the captured PNGs. Resolves with whether the
// user went through with a share.
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
  NSMutableArray *items = [NSMutableArray arrayWithObject:image];
  if ([options[@"text"] isKindOfClass:[NSString class]]) {
    [items addObject:options[@"text"]];
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
