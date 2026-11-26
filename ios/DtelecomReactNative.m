#import "DtelecomReactNative.h"
#import <AVFoundation/AVFoundation.h>
#import <AVKit/AVKit.h>
#import <React/RCTBridgeModule.h>
#import <LiveKitWebRTC/LiveKitWebRTC.h>
#import <LKRNWebRTCModuleOptions.h>

static NSString *const RouteChangeEvent = @"dTelecomAudioRouteChanged";

@implementation DtelecomReactNative

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup {
    return NO;
}

- (dispatch_queue_t)methodQueue {
    return dispatch_get_main_queue();
}

// Existing native consumers may opt in to layered video encoding before RN starts.
+ (void)setup {
    LKRTCDefaultVideoEncoderFactory *factory = [[LKRTCDefaultVideoEncoderFactory alloc] init];
    [LKRNWebRTCModuleOptions sharedInstance].videoEncoderFactory =
        [[LKRTCVideoEncoderFactorySimulcast alloc] initWithPrimary:factory fallback:factory];
}

- (NSArray<NSString *> *)supportedEvents {
    return @[RouteChangeEvent];
}

- (void)startObserving {
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(routeChanged:)
                                                 name:AVAudioSessionRouteChangeNotification object:nil];
}

- (void)stopObserving {
    [[NSNotificationCenter defaultCenter] removeObserver:self name:AVAudioSessionRouteChangeNotification object:nil];
}

static NSString *outputKind(AVAudioSessionPort port) {
    if ([port isEqualToString:AVAudioSessionPortBuiltInReceiver]) return @"earpiece";
    if ([port isEqualToString:AVAudioSessionPortBuiltInSpeaker]) return @"speaker";
    if ([port isEqualToString:AVAudioSessionPortHeadphones] || [port isEqualToString:AVAudioSessionPortHeadsetMic] ||
        [port isEqualToString:AVAudioSessionPortLineOut] || [port isEqualToString:AVAudioSessionPortUSBAudio]) return @"headset";
    if ([port isEqualToString:AVAudioSessionPortBluetoothA2DP] || [port isEqualToString:AVAudioSessionPortBluetoothHFP] ||
        [port isEqualToString:AVAudioSessionPortBluetoothLE]) return @"bluetooth";
    return @"other";
}

static BOOL supportsSpeakerOverride(void) {
    return [[AVAudioSession sharedInstance].category isEqualToString:AVAudioSessionCategoryPlayAndRecord];
}

- (NSDictionary *)currentRoute {
    AVAudioSession *session = [AVAudioSession sharedInstance];
    NSMutableOrderedSet *available = [NSMutableOrderedSet orderedSetWithObject:@"speaker"];
    if (UIDevice.currentDevice.userInterfaceIdiom == UIUserInterfaceIdiomPhone) [available addObject:@"earpiece"];
    for (AVAudioSessionPortDescription *input in session.availableInputs) {
        if (![input.portType isEqualToString:AVAudioSessionPortBuiltInMic]) [available addObject:outputKind(input.portType)];
    }
    for (AVAudioSessionPortDescription *output in session.currentRoute.outputs) {
        [available addObject:outputKind(output.portType)];
    }
    AVAudioSessionPortDescription *output = session.currentRoute.outputs.firstObject;
    return @{@"availableOutputs": available.array,
             @"selectedOutput": output ? outputKind(output.portType) : @"unknown",
             @"selectableOutputs": supportsSpeakerOverride() ? @[@"default", @"force_speaker"] : @[]};
}

- (void)routeChanged:(NSNotification *)notification {
    [self sendEventWithName:RouteChangeEvent body:[self currentRoute]];
}

RCT_REMAP_METHOD(getAudioRoute, getAudioRouteWithResolver:(RCTPromiseResolveBlock)resolve
                                               rejecter:(RCTPromiseRejectBlock)reject) {
    resolve([self currentRoute]);
}

RCT_EXPORT_METHOD(selectAudioOutput:(NSString *)deviceId
                       withResolver:(RCTPromiseResolveBlock)resolve
                       withRejecter:(RCTPromiseRejectBlock)reject) {
    BOOL speaker = [deviceId isEqualToString:@"force_speaker"];
    if (!speaker && ![deviceId isEqualToString:@"default"]) {
        resolve(@NO);
        return;
    }
    LKRTCAudioSession *session = [LKRTCAudioSession sharedInstance];
    [session lockForConfiguration];
    NSError *error = nil;
    BOOL success = NO;
    if (supportsSpeakerOverride()) {
        success = [session overrideOutputAudioPort:speaker ? AVAudioSessionPortOverrideSpeaker : AVAudioSessionPortOverrideNone
                                             error:&error];
    }
    [session unlockForConfiguration];
    if (error) reject(@"audio_route", error.localizedDescription, error);
    else resolve(@(success));
}

RCT_EXPORT_METHOD(showAudioRoutePicker) {
    AVRoutePickerView *picker = [[AVRoutePickerView alloc] init];
    for (UIView *view in picker.subviews) {
        if ([view isKindOfClass:[UIButton class]]) {
            [(UIButton *)view sendActionsForControlEvents:UIControlEventTouchUpInside];
            break;
        }
    }
}

@end
