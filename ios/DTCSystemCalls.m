#import "DTCSystemCalls.h"
#import <AVFoundation/AVFoundation.h>
#import <CallKit/CallKit.h>
#import <LiveKitWebRTC/LiveKitWebRTC.h>
#import <React/RCTEventEmitter.h>

NSNotificationName const DTCSystemCallDidReceiveActionNotification = @"dTelecomCallActionAvailable";
#define Changed DTCSystemCallDidReceiveActionNotification
static NSString *const Journal = @"org.dtelecom.rtc.callActions.v1";
static NSString *const EndedCalls = @"org.dtelecom.rtc.endedCalls.v1";

static NSError *callError(NSString *message) {
    return [NSError errorWithDomain:@"DtelecomSystemCalls" code:1
                           userInfo:@{NSLocalizedDescriptionKey:message}];
}

@interface DTCSystemCalls () <CXProviderDelegate>
@property(nonatomic, strong) CXProvider *provider;
@property(nonatomic, strong) CXCallController *controller;
@property(nonatomic, strong) NSUUID *current;
@property(nonatomic) BOOL video;
@property(nonatomic, copy) NSString *displayName;
@property(nonatomic) BOOL answered;
@property(nonatomic) BOOL incoming;
@property(nonatomic) BOOL muted;
@property(nonatomic) BOOL manual;
@property(nonatomic) BOOL previousManual;
@property(nonatomic) BOOL previousEnabled;
@property(nonatomic) BOOL audioActive;
@end

@implementation DTCSystemCalls

+ (instancetype)shared {
    static DTCSystemCalls *instance;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ instance = [DTCSystemCalls new]; });
    return instance;
}

- (void)prepareProvider {
    if (_provider) return;
    CXProviderConfiguration *config = [[CXProviderConfiguration alloc] init];
    config.supportsVideo = YES;
    config.supportedHandleTypes = [NSSet setWithObject:@(CXHandleTypeGeneric)];
    config.maximumCallGroups = 1;
    config.maximumCallsPerCallGroup = 1;
    config.includesCallsInRecents = YES;
    _provider = [[CXProvider alloc] initWithConfiguration:config];
    [_provider setDelegate:self queue:dispatch_get_main_queue()];
    _controller = [CXCallController new];
}

- (void)emit:(NSString *)action muted:(NSNumber *)muted {
    if (!_current) return;
    NSMutableDictionary *event = [@{@"id":NSUUID.UUID.UUIDString,
                                     @"callId":_current.UUIDString.lowercaseString,
                                     @"action":action} mutableCopy];
    if (muted) event[@"muted"] = muted;
    NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
    NSMutableArray *pending = [[defaults arrayForKey:Journal] mutableCopy] ?: [NSMutableArray new];
    [pending addObject:event];
    [defaults setObject:pending forKey:Journal];
    [NSNotificationCenter.defaultCenter postNotificationName:Changed object:nil userInfo:event];
}

- (void)rememberEnded:(NSUUID *)uuid {
    NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
    NSMutableArray *ended = [[defaults arrayForKey:EndedCalls] mutableCopy] ?: [NSMutableArray new];
    [ended removeObject:uuid.UUIDString];
    [ended addObject:uuid.UUIDString];
    if (ended.count > 128) [ended removeObjectAtIndex:0];
    [defaults setObject:ended forKey:EndedCalls];
}

- (BOOL)ended:(NSUUID *)uuid {
    return [[NSUserDefaults.standardUserDefaults arrayForKey:EndedCalls] containsObject:uuid.UUIDString];
}

+ (void)reportIncoming:(NSUUID *)uuid handle:(NSString *)handle displayName:(NSString *)name
                video:(BOOL)video completion:(void (^)(NSError *))completion {
    if (!NSThread.isMainThread) {
        dispatch_async(dispatch_get_main_queue(), ^{ [self reportIncoming:uuid handle:handle displayName:name video:video completion:completion]; });
        return;
    }
    DTCSystemCalls *calls = [self shared];
    if ([calls.current isEqual:uuid]) { completion(nil); return; }
    if ([calls ended:uuid] || calls.current) { completion(callError(@"Call has ended or another call is active")); return; }
    [calls prepareProvider];
    calls.current = uuid;
    calls.video = video;
    calls.incoming = YES;
    CXCallUpdate *update = [CXCallUpdate new];
    update.remoteHandle = [[CXHandle alloc] initWithType:CXHandleTypeGeneric value:handle];
    update.localizedCallerName = name;
    update.hasVideo = video;
    update.supportsHolding = NO;
    update.supportsGrouping = NO;
    update.supportsUngrouping = NO;
    update.supportsDTMF = NO;
    [calls.provider reportNewIncomingCallWithUUID:uuid update:update completion:^(NSError *error) {
        dispatch_async(dispatch_get_main_queue(), ^{
            if ([calls.current isEqual:uuid]) {
                if (error) calls.current = nil;
                else [calls emit:@"incoming" muted:nil];
            }
            completion(error);
        });
    }];
}

- (void)restoreAudio {
    LKRTCAudioSession *rtc = LKRTCAudioSession.sharedInstance;
    if (_audioActive) {
        rtc.isAudioEnabled = NO;
        [rtc audioSessionDidDeactivate:AVAudioSession.sharedInstance];
        _audioActive = NO;
        [self emit:@"audioDeactivated" muted:nil];
    }
    if (_manual) {
        rtc.useManualAudio = _previousManual;
        rtc.isAudioEnabled = _previousEnabled;
        _manual = NO;
    }
}

- (void)finish:(NSString *)reason {
    if (!_current) return;
    [self restoreAudio];
    [self rememberEnded:_current];
    [self emit:reason muted:nil];
    _current = nil;
    _displayName = nil;
    _answered = NO;
    _muted = NO;
}

+ (void)reportRemoteEnd:(NSUUID *)uuid {
    if (!NSThread.isMainThread) {
        dispatch_async(dispatch_get_main_queue(), ^{ [self reportRemoteEnd:uuid]; });
        return;
    }
    DTCSystemCalls *calls = [self shared];
    if (![calls.current isEqual:uuid]) { [calls rememberEnded:uuid]; return; }
    [calls.provider reportCallWithUUID:uuid endedAtDate:nil reason:CXCallEndedReasonRemoteEnded];
    [calls finish:@"remoteEnd"];
}

- (BOOL)prepareAudio {
    if (_manual) return YES;
    AVAudioSession *av = AVAudioSession.sharedInstance;
    NSError *error = nil;
    if (![av setCategory:AVAudioSessionCategoryPlayAndRecord
                    mode:_video ? AVAudioSessionModeVideoChat : AVAudioSessionModeVoiceChat
                 options:AVAudioSessionCategoryOptionAllowBluetooth error:&error]) return NO;
    LKRTCAudioSession *rtc = LKRTCAudioSession.sharedInstance;
    _previousManual = rtc.useManualAudio;
    _previousEnabled = rtc.isAudioEnabled;
    rtc.useManualAudio = YES;
    rtc.isAudioEnabled = NO;
    _manual = YES;
    return YES;
}

- (void)provider:(CXProvider *)provider performAnswerCallAction:(CXAnswerCallAction *)action {
    if (![_current isEqual:action.callUUID] || ![self prepareAudio]) { [action fail]; return; }
    if (!_answered) { _answered = YES; [self emit:@"answer" muted:nil]; }
    [action fulfill];
}

- (void)provider:(CXProvider *)provider performStartCallAction:(CXStartCallAction *)action {
    if (![_current isEqual:action.callUUID] || ![self prepareAudio]) { [action fail]; return; }
    CXCallUpdate *update = [CXCallUpdate new];
    update.localizedCallerName = _displayName;
    update.hasVideo = _video;
    [provider reportCallWithUUID:action.callUUID updated:update];
    [self emit:@"outgoing" muted:nil];
    [provider reportOutgoingCallWithUUID:action.callUUID startedConnectingAtDate:nil];
    [action fulfill];
}

- (void)provider:(CXProvider *)provider performEndCallAction:(CXEndCallAction *)action {
    if (![_current isEqual:action.callUUID]) { [action fail]; return; }
    [self finish:@"end"];
    [action fulfill];
}

- (void)provider:(CXProvider *)provider performSetMutedCallAction:(CXSetMutedCallAction *)action {
    if (![_current isEqual:action.callUUID]) { [action fail]; return; }
    if (_muted != action.isMuted) { _muted = action.isMuted; [self emit:@"mute" muted:@(_muted)]; }
    [action fulfill];
}

- (void)provider:(CXProvider *)provider didActivateAudioSession:(AVAudioSession *)session {
    if (!_current || !_manual || _audioActive) return;
    [LKRTCAudioSession.sharedInstance audioSessionDidActivate:session];
    LKRTCAudioSession.sharedInstance.isAudioEnabled = YES;
    _audioActive = YES;
    [self emit:@"audioActivated" muted:nil];
}

- (void)provider:(CXProvider *)provider didDeactivateAudioSession:(AVAudioSession *)session {
    if (!_audioActive) return;
    LKRTCAudioSession.sharedInstance.isAudioEnabled = NO;
    [LKRTCAudioSession.sharedInstance audioSessionDidDeactivate:session];
    _audioActive = NO;
    [self emit:@"audioDeactivated" muted:nil];
}

- (void)providerDidReset:(CXProvider *)provider {
    [self finish:@"reset"];
}

@end

@interface DtelecomSystemCalls : RCTEventEmitter
@end

@implementation DtelecomSystemCalls
RCT_EXPORT_MODULE()
+ (BOOL)requiresMainQueueSetup { return NO; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }
- (NSArray<NSString *> *)supportedEvents { return @[Changed]; }
- (void)startObserving {
    [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(wake:) name:Changed object:nil];
}
- (void)stopObserving { [NSNotificationCenter.defaultCenter removeObserver:self name:Changed object:nil]; }
- (void)wake:(NSNotification *)note { [self sendEventWithName:Changed body:nil]; }

RCT_EXPORT_METHOD(currentCallId:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    resolve(DTCSystemCalls.shared.current.UUIDString.lowercaseString);
}
RCT_EXPORT_METHOD(pending:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    resolve([NSUserDefaults.standardUserDefaults arrayForKey:Journal] ?: @[]);
}
RCT_EXPORT_METHOD(acknowledge:(NSString *)eventId resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
    NSMutableArray *pending = [[defaults arrayForKey:Journal] mutableCopy];
    if ([pending.firstObject[@"id"] isEqual:eventId]) {
        [pending removeObjectAtIndex:0];
        [defaults setObject:pending forKey:Journal];
    }
    resolve(nil);
}

- (void)request:(CXCallAction *)action resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    DTCSystemCalls *calls = DTCSystemCalls.shared;
    if (![calls.current isEqual:action.callUUID]) { reject(@"system_call", @"Unknown call", nil); return; }
    [calls.controller requestTransaction:[[CXTransaction alloc] initWithAction:action] completion:^(NSError *error) {
        dispatch_async(dispatch_get_main_queue(), ^{
            if (error) {
                if ([action isKindOfClass:CXStartCallAction.class] && [calls.current isEqual:action.callUUID]) [calls finish:@"reset"];
                reject(@"system_call", error.localizedDescription, error);
            } else resolve(nil);
        });
    }];
}

- (NSUUID *)uuid:(NSString *)value reject:(RCTPromiseRejectBlock)reject {
    NSUUID *uuid = [[NSUUID alloc] initWithUUIDString:value];
    if (!uuid) reject(@"system_call", @"A call ID must be a UUID", nil);
    return uuid;
}
RCT_EXPORT_METHOD(outgoing:(NSString *)value displayName:(NSString *)name video:(BOOL)video handle:(NSString *)handle
                  resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    NSUUID *uuid = [self uuid:value reject:reject];
    if (!uuid) return;
    DTCSystemCalls *calls = DTCSystemCalls.shared;
    if ([calls.current isEqual:uuid]) { resolve(nil); return; }
    if (calls.current || [calls ended:uuid]) { reject(@"system_call", @"Call has ended or another call is active", nil); return; }
    [calls prepareProvider];
    calls.current = uuid;
    calls.video = video;
    calls.incoming = NO;
    calls.displayName = name;
    CXStartCallAction *action = [[CXStartCallAction alloc] initWithCallUUID:uuid handle:[[CXHandle alloc] initWithType:CXHandleTypeGeneric value:handle]];
    action.video = video;
    [self request:action resolve:resolve reject:reject];
}
RCT_EXPORT_METHOD(connected:(NSString *)value resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    NSUUID *uuid = [self uuid:value reject:reject]; if (!uuid) return;
    DTCSystemCalls *calls = DTCSystemCalls.shared;
    if (![calls.current isEqual:uuid]) { reject(@"system_call", @"Unknown call", nil); return; }
    if (!calls.incoming) [calls.provider reportOutgoingCallWithUUID:uuid connectedAtDate:nil];
    resolve(nil);
}
RCT_EXPORT_METHOD(answer:(NSString *)value resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    NSUUID *uuid = [self uuid:value reject:reject]; if (uuid) [self request:[[CXAnswerCallAction alloc] initWithCallUUID:uuid] resolve:resolve reject:reject];
}
RCT_EXPORT_METHOD(end:(NSString *)value resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    NSUUID *uuid = [self uuid:value reject:reject]; if (uuid) [self request:[[CXEndCallAction alloc] initWithCallUUID:uuid] resolve:resolve reject:reject];
}
RCT_EXPORT_METHOD(setMuted:(NSString *)value muted:(BOOL)muted resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    NSUUID *uuid = [self uuid:value reject:reject]; if (uuid) [self request:[[CXSetMutedCallAction alloc] initWithCallUUID:uuid muted:muted] resolve:resolve reject:reject];
}
RCT_EXPORT_METHOD(remoteEnd:(NSString *)value resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
    NSUUID *uuid = [self uuid:value reject:reject]; if (!uuid) return;
    [DTCSystemCalls reportRemoteEnd:uuid]; resolve(nil);
}
@end
