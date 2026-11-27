# Incoming calls and system audio

The Rooms example joins a room in the foreground. For an app that rings the phone, enable the optional native entry points below in the app that receives the push. The SDK supports one system call at a time. Your backend owns invitations, expiry, push credentials and RTC grants. Use a stable UUID per call on both operating systems. Look up the private room identifier and participant token inside the app.

## iOS

Configure the app’s APNs and VoIP background capabilities and install its PushKit delegate at launch. After validating an incoming invitation, report it immediately from that native delegate, including on a cold start. Pass the PushKit completion handler through the result path. This creates the SDK’s single CallKit provider. Use one provider for the call throughout its lifetime.

```objc
#if __has_include(<dtelecom-react-native/DTCSystemCalls.h>)
#import <dtelecom-react-native/DTCSystemCalls.h>
#else
#import <dtelecom_react_native/DTCSystemCalls.h>
#endif

// Inside the host's PKPushRegistry delegate, after decoding the invite.
[DTCSystemCalls reportIncoming:callUUID
                        handle:contactHandle
                   displayName:callerDisplayName
                         video:hasVideo
                    completion:^(NSError *error) {
    // Record/report a rejection using the app's invitation lifecycle.
    completion();
}];

// When your backend confirms that the peer cancelled or left:
[DTCSystemCalls reportRemoteEnd:callUUID];
```

The provider implements answer, end and mute actions before React Native starts. It signals activation and deactivation to WebRTC, enables manual audio during the call and restores the previous setting on teardown. Public route reads, speaker selection and the iOS route picker are available through `AudioSession`. Finish any ordinary room's audio session before starting a system call. For Recents, the provider reports a generic handle and includes calls in Recents. Handle the resulting user activity in your app and resolve that handle to the contact or new invitation.

Apps that must decline on their backend before JS starts can observe `DTCSystemCallDidReceiveActionNotification` from their native launch code. Its `userInfo` contains the event. Use its stable event ID with your backend for idempotency. [Apple PushKit guidance](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit)

## Android

The SDK supplies an incoming call notification, answer/decline screen, ongoing foreground service and route/focus integration. The calling app opts into the components in its manifest. Request microphone and notification permissions in the foreground. Configure the full-screen permission only for an eligible calling app. Android may present the notification as a heads-up alert instead of opening the locked-screen activity.

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE"/>
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT"/>

<!-- Inside application -->
<activity android:name="com.livekit.reactnative.calls.SystemCallActivity"
          android:exported="false" android:excludeFromRecents="true"/>
<receiver android:name="com.livekit.reactnative.calls.SystemCallReceiver" android:exported="false"/>
<service android:name="com.livekit.reactnative.calls.SystemCallService"
         android:foregroundServiceType="microphone|mediaPlayback" android:exported="false"/>
```

Call the SDK directly from your app's validated high-priority FCM invite handler. Use the main application process for push, UI, service and React Native. Check invitation expiry before reporting. If notification permission or the incoming channel is disabled, the SDK rejects the incoming report so the app can handle it. The Android components only run when invoked.

```kotlin
import com.livekit.reactnative.calls.SystemCallController

SystemCallController.reportIncoming(applicationContext, callUUID, callerName, hasVideo)
// On validated cancellation or remote hangup:
SystemCallController.reportRemoteEnd(applicationContext, callUUID)
```

The SDK starts its ongoing service after the user answers or the app starts an outgoing call in the foreground. The service shares the existing audio-route manager with ordinary rooms. Apps can use `SystemCallController.onNativeAction` to handle backend commands before JS starts. Observe Android background-start, permission and force-stop restrictions on the target devices. [Android call notifications](https://developer.android.com/develop/ui/views/notifications/call-style)

## React Native

Register the listener once when your app starts. The native event journal holds unacknowledged actions, including a cancellation that raced with launch. Processing is ordered. If a handler throws, its action remains queued. Call `retry()` when your dependencies are ready. Make side effects idempotent by event ID because a process may stop between your handler and native acknowledgement. The journal contains only a call UUID and action details. Keep tokens, encryption keys and caller profile data in your own appropriate stores.

```tsx
import { SystemCalls } from '@dtelecom/react-native';

const subscription = SystemCalls.listen(async (event) => {
  switch (event.action) {
    case 'answer':
    case 'outgoing':
      if (await SystemCalls.currentCallId() === event.callId) {
        await joinFromInvitation(event.callId, event.id);
      }
      break;
    case 'mute':
      await setLocalMute(event.callId, event.muted === true);
      break;
    case 'end':
    case 'remoteEnd':
    case 'reset':
      await leaveIfJoined(event.callId);
      break;
  }
}, showCallError);

// On user-initiated outgoing call:
await SystemCalls.outgoing(callUUID, displayName, hasVideo, contactHandle);
// When the outgoing connection is established:
await SystemCalls.connected(callUUID);
// Local UI may end the call or synchronize the system mute control.
await SystemCalls.setMuted(callUUID, true);
await SystemCalls.end(callUUID);

// At shutdown of the listener's owner:
subscription.remove();
```

`audioActivated` and `audioDeactivated` are native audio lifecycle notifications. Media publication, microphone permissions, the room token and the E2EE key stay under the room integration. After reconnect or relaunch, reconcile the call against your backend before proceeding.
