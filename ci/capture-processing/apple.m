#import <Foundation/Foundation.h>
#import <LiveKitWebRTC/RTCDefaultAudioProcessingModule.h>
#import "DTelecomCaptureProcessing.h"
#import "LKRNWebRTCModuleOptions.h"
#import <assert.h>

@interface CaptureProbe : NSObject <LKRTCAudioCustomProcessingDelegate>
@property NSUInteger starts;
@property NSUInteger frames;
@property NSUInteger stops;
@property size_t sampleRate;
@property size_t channels;
@property(nonatomic, strong) LKRTCAudioBuffer *lastFrame;
@end

@implementation CaptureProbe
- (void)audioProcessingInitializeWithSampleRate:(size_t)sampleRate channels:(size_t)channels {
    self.starts++;
    self.sampleRate = sampleRate;
    self.channels = channels;
}
- (void)audioProcessingProcess:(LKRTCAudioBuffer *)frame {
    self.frames++;
    self.lastFrame = frame;
}
- (void)audioProcessingRelease {
    self.stops++;
}
@end

int main(void) {
    @autoreleasepool {
        DTelecomCaptureProcessing *host = DTelecomCaptureProcessing.sharedInstance;
        assert([host install]);
        LKRTCDefaultAudioProcessingModule *module = (id)LKRNWebRTCModuleOptions.sharedInstance.audioProcessingModule;
        assert([host install] && LKRNWebRTCModuleOptions.sharedInstance.audioProcessingModule == module);

        // Get the delegate back from M150. Direct calls to the host would miss a broken registration.
        id<LKRTCAudioCustomProcessingDelegate> delegate = module.capturePostProcessingDelegate;
        assert(delegate);
        [delegate audioProcessingInitializeWithSampleRate:48000 channels:2];
        CaptureProbe *first = [CaptureProbe new];
        [host setProcessor:first];
        [host setProcessor:first];
        assert(first.starts == 1 && first.sampleRate == 48000 && first.channels == 2);

        LKRTCAudioBuffer *frame = [LKRTCAudioBuffer new];
        [delegate audioProcessingProcess:frame];
        assert(first.frames == 1 && first.lastFrame == frame);

        CaptureProbe *second = [CaptureProbe new];
        [host setProcessor:second];
        assert(first.stops == 1 && second.starts == 1 && second.sampleRate == 48000 && second.channels == 2);
        [delegate audioProcessingProcess:frame];
        assert(first.frames == 1 && second.frames == 1 && second.lastFrame == frame);

        [host setProcessor:nil];
        [delegate audioProcessingProcess:frame];
        assert(second.stops == 1 && second.frames == 1);

        [host setProcessor:first];
        [delegate audioProcessingRelease];
        [host setProcessor:nil];
        assert(first.starts == 2 && first.stops == 2 && second.stops == 1);
    }
    return 0;
}
