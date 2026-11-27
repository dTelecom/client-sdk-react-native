// Drive the installed native provider before JS starts. The doubles isolate OS service
// delivery and audio hardware; the provider, event journal and real CallKit actions run here.
#import "DTCSystemCalls.h"
#import <AVFAudio/AVFAudio.h>
#import <CallKit/CallKit.h>
#import <LiveKitWebRTC/LiveKitWebRTC.h>
#import <objc/runtime.h>
#include <stdio.h>
#include <stdlib.h>

#define CHECK(x) do { if (!(x)) { fprintf(stderr, "%s:%d: %s\n", __func__, __LINE__, #x); abort(); } } while (0)

@interface DTCSystemCalls (TestAccess) <CXProviderDelegate>
+ (instancetype)shared;
@end

@interface TestProvider : NSObject
@property(nonatomic) NSUInteger reports;
@property(nonatomic) NSUInteger ends;
@end
@implementation TestProvider
- (void)reportNewIncomingCallWithUUID:(NSUUID *)uuid update:(CXCallUpdate *)update
                           completion:(void (^)(NSError *))completion {
    self.reports++;
    completion(nil);
}
- (void)reportCallWithUUID:(NSUUID *)uuid endedAtDate:(NSDate *)date reason:(CXCallEndedReason)reason {
    self.ends++;
}
@end

@interface TestAudio : NSObject
@property(nonatomic) BOOL isAudioEnabled;
@property(nonatomic) BOOL useManualAudio;
@property(nonatomic) NSUInteger activations;
@property(nonatomic) NSUInteger deactivations;
@end
@implementation TestAudio
- (BOOL)setCategory:(NSString *)category mode:(NSString *)mode
            options:(AVAudioSessionCategoryOptions)options error:(NSError **)error {
    CHECK([category isEqualToString:AVAudioSessionCategoryPlayAndRecord]);
    return YES;
}
- (void)audioSessionDidActivate:(AVAudioSession *)session { self.activations++; }
- (void)audioSessionDidDeactivate:(AVAudioSession *)session { self.deactivations++; }
@end

static TestAudio *audio;
static NSUserDefaults *defaults;
static id sharedAudio(id obj, SEL selector) { return audio; }
static id sharedDefaults(id obj, SEL selector) { return defaults; }
static NSError *incoming(NSUUID *uuid) {
    __block BOOL done = NO;
    __block NSError *result = nil;
    [DTCSystemCalls reportIncoming:uuid handle:@"test" displayName:@"Caller" video:NO completion:^(NSError *error) {
        result = error;
        done = YES;
    }];
    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:2];
    while (!done && deadline.timeIntervalSinceNow > 0) {
        [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.01]];
    }
    CHECK(done);
    return result;
}

int main(void) {
    @autoreleasepool {
        NSString *suite = [@"org.dtelecom.ci." stringByAppendingString:NSUUID.UUID.UUIDString];
        defaults = [[NSUserDefaults alloc] initWithSuiteName:suite];
        audio = [TestAudio new];
        audio.isAudioEnabled = YES;
        method_setImplementation(class_getClassMethod(NSUserDefaults.class, @selector(standardUserDefaults)), (IMP)sharedDefaults);
        method_setImplementation(class_getClassMethod(AVAudioSession.class, @selector(sharedInstance)), (IMP)sharedAudio);
        method_setImplementation(class_getClassMethod(LKRTCAudioSession.class, @selector(sharedInstance)), (IMP)sharedAudio);
        DTCSystemCalls *calls = DTCSystemCalls.shared;
        TestProvider *provider = [TestProvider new];
        CXProvider *callbackProvider = (id)provider;
        [calls setValue:provider forKey:@"provider"];
        NSUUID *first = NSUUID.UUID;
        NSUUID *second = NSUUID.UUID;
        CHECK(!incoming(first) && !incoming(first) && provider.reports == 1);
        CHECK(incoming(second));
        [calls provider:callbackProvider performAnswerCallAction:[[CXAnswerCallAction alloc] initWithCallUUID:first]];
        CHECK(audio.useManualAudio && !audio.isAudioEnabled);
        [calls provider:callbackProvider didActivateAudioSession:AVAudioSession.sharedInstance];
        [calls provider:callbackProvider didActivateAudioSession:AVAudioSession.sharedInstance];
        CHECK(audio.isAudioEnabled && audio.activations == 1);
        [calls provider:callbackProvider performSetMutedCallAction:[[CXSetMutedCallAction alloc] initWithCallUUID:first muted:YES]];
        [calls provider:callbackProvider didDeactivateAudioSession:AVAudioSession.sharedInstance];
        CHECK(!audio.isAudioEnabled && audio.deactivations == 1);
        [calls provider:callbackProvider didActivateAudioSession:AVAudioSession.sharedInstance];
        [DTCSystemCalls reportRemoteEnd:first];
        [calls provider:callbackProvider didDeactivateAudioSession:AVAudioSession.sharedInstance];
        CHECK(audio.activations == 2 && audio.deactivations == 2 && !audio.useManualAudio && audio.isAudioEnabled);
        CHECK(provider.ends == 1 && incoming(first));
        CHECK(!incoming(second));
        [calls providerDidReset:callbackProvider];
        CHECK(incoming(second));
        NSUUID *cancelled = NSUUID.UUID;
        [DTCSystemCalls reportRemoteEnd:cancelled];
        CHECK(incoming(cancelled) && provider.reports == 2);
        NSArray *events = [defaults arrayForKey:@"org.dtelecom.rtc.callActions.v1"];
        NSArray *expected = @[@"incoming", @"answer", @"audioActivated", @"mute", @"audioDeactivated",
                              @"audioActivated", @"audioDeactivated", @"remoteEnd", @"incoming", @"reset"];
        CHECK([[events valueForKey:@"action"] isEqual:expected]);
        CHECK([NSSet setWithArray:[events valueForKey:@"id"]].count == events.count);
        [defaults removePersistentDomainForName:suite];
        puts("Passed native call action, cancellation, journal, audio deactivation and ownership checks");
    }
    return 0;
}
