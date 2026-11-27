#import "DTelecomCaptureProcessing.h"
#import <LKRNWebRTCModuleOptions.h>
#import <LiveKitWebRTC/RTCDefaultAudioProcessingModule.h>

@interface DTelecomCaptureProcessing () <LKRTCAudioCustomProcessingDelegate>
@end

@implementation DTelecomCaptureProcessing {
    LKRTCDefaultAudioProcessingModule *_module;
    id<LKRTCAudioCustomProcessingDelegate> _processor;
    size_t _sampleRate;
    size_t _channels;
}

+ (instancetype)sharedInstance {
    static DTelecomCaptureProcessing *instance;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ instance = [self new]; });
    return instance;
}

- (BOOL)install {
    @synchronized (self) {
        LKRNWebRTCModuleOptions *options = LKRNWebRTCModuleOptions.sharedInstance;
        if (options.audioProcessingModule != nil) return options.audioProcessingModule == _module;
        _module = [[LKRTCDefaultAudioProcessingModule alloc] init];
        // M150's adapter initializer ignores its delegate argument. Use the property setter.
        _module.capturePostProcessingDelegate = self;
        options.audioProcessingModule = _module;
        return YES;
    }
}

- (void)setProcessor:(id<LKRTCAudioCustomProcessingDelegate>)processor {
    @synchronized (self) {
        if (processor == _processor) return;
        if (_sampleRate) [_processor audioProcessingRelease];
        _processor = processor;
        if (_sampleRate) [_processor audioProcessingInitializeWithSampleRate:_sampleRate channels:_channels];
    }
}

- (void)audioProcessingInitializeWithSampleRate:(size_t)sampleRate channels:(size_t)channels {
    @synchronized (self) {
        _sampleRate = sampleRate;
        _channels = channels;
        [_processor audioProcessingInitializeWithSampleRate:sampleRate channels:channels];
    }
}

- (void)audioProcessingProcess:(LKRTCAudioBuffer *)audioBuffer {
    @synchronized (self) {
        [_processor audioProcessingProcess:audioBuffer];
    }
}

- (void)audioProcessingRelease {
    @synchronized (self) {
        if (_sampleRate) [_processor audioProcessingRelease];
        _sampleRate = 0;
        _channels = 0;
    }
}
@end
