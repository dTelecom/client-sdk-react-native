#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN
/// Posted on the main queue after a native action is saved. userInfo carries the same event as JS.
FOUNDATION_EXPORT NSNotificationName const DTCSystemCallDidReceiveActionNotification;

/// Report a validated app invitation on the main queue from the native PushKit delegate.
@interface DTCSystemCalls : NSObject
+ (void)reportIncoming:(NSUUID *)callID
               handle:(NSString *)handle
          displayName:(NSString *)displayName
                video:(BOOL)video
           completion:(void (^)(NSError *_Nullable))completion;
+ (void)reportRemoteEnd:(NSUUID *)callID;
@end
NS_ASSUME_NONNULL_END
