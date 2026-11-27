#import <Foundation/Foundation.h>
#import <LiveKitWebRTC/RTCAudioCustomProcessingDelegate.h>

NS_ASSUME_NONNULL_BEGIN

/** Optional, process-wide microphone processor. Install before the WebRTC factory starts. */
@interface DTelecomCaptureProcessing : NSObject
+ (instancetype)sharedInstance;
- (BOOL)install;
/** Replacing or clearing the processor finishes the previous delegate's processing lifecycle. */
- (void)setProcessor:(nullable id<LKRTCAudioCustomProcessingDelegate>)processor;
@end

NS_ASSUME_NONNULL_END
