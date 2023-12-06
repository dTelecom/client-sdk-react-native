# dtelecom-react-native

<!--BEGIN_DESCRIPTION-->Use this SDK to add real-time video, audio and data features to your React Native app. By connecting to a <a href="https://video.dtelecom.org/">dTelecom</a> server, you can quickly build applications like interactive live streaming or video calls with just a few lines of code.<!--END_DESCRIPTION-->

## Installation

### NPM

```sh
npm install @dtelecom/react-native @dtelecom/react-native-webrtc
```

### Yarn

```sh
yarn add @dtelecom/react-native @dtelecom/react-native-webrtc
```

This library depends on `@dtelecom/react-native-webrtc`, which has additional installation instructions found here:

- [iOS Installation Guide](https://github.com/dtelecom/react-native-webrtc/blob/master/Documentation/iOSInstallation.md)
- [Android Installation Guide](https://github.com/dtelecom/react-native-webrtc/blob/master/Documentation/AndroidInstallation.md)

---

Once the `@dtelecom/react-native-webrtc` dependency is installed, one last step is needed to finish the installation:

### Android

In your [MainApplication.java](https://github.com/dtelecom/client-sdk-react-native/blob/main/example/android/app/src/main/java/com/example/livekitreactnative/MainApplication.java) file:

```
import com.livekit.reactnative.LiveKitReactNative;
import com.livekit.reactnative.audio.AudioType;

public class MainApplication extends Application implements ReactApplication {

  @Override
  public void onCreate() {
    // Place this above any other RN related initialization
    // When AudioType is omitted, it'll default to CommunicationAudioType
    // use MediaAudioType if user is only consuming audio, and not publishing
    LiveKitReactNative.setup(this, new AudioType.CommunicationAudioType());

    //...
  }
}
```

### iOS

In your [AppDelegate.m](https://github.com/dtelecom/client-sdk-react-native/blob/main/example/ios/Dmeet/AppDelegate.mm) file:

```
#import "LivekitReactNative.h"

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  // Place this above any other RN related initialization
  [LivekitReactNative setup];

  //...
}
```

## Example app

We've included an [example app](example/) that you can try out.

## Usage

In your `index.js` file, setup the dTelecom SDK by calling `registerGlobals()`.
This sets up the required WebRTC libraries for use in Javascript, and is needed for LiveKit to work.

```js
import { registerGlobals } from '@dtelecom/react-native';

// ...

registerGlobals();
```

A Room object can then be created and connected to.

```js
import { Participant, Room, Track } from '@dtelecom/livekit-client';
import { useRoom, AudioSession, VideoView } from '@dtelecom/react-native';

/*...*/

// Create a room state
const [room] = useState(() => new Room());

// Get the participants from the room
const { participants } = useRoom(room);

useEffect(() => {
  let connect = async () => {
    await AudioSession.startAudioSession();
    await room.connect(url, token, {});
    console.log('connected to ', url, ' ', token);
  };
  connect();
  return () => {
    room.disconnect();
    AudioSession.stopAudioSession();
  };
}, [url, token, room]);

const videoView = participants.length > 0 && (
  <VideoView
    style={{ flex: 1, width: '100%' }}
    videoTrack={participants[0].getTrack(Track.Source.Camera)?.videoTrack}
  />
);
```

[API documentation is located here.](https://htmlpreview.github.io/?https://raw.githubusercontent.com/dtelecom/client-sdk-react-native/main/docs/modules.html)

Additional documentation for the dTelecom SDK can be found at https://docs.dtelecom.org/

## Audio sessions

As seen in the above example, we've introduced a new class `AudioSession` that helps
to manage the audio session on native platforms. This class wraps either [AudioManager](https://developer.android.com/reference/android/media/AudioManager) on Android, or [AVAudioSession](https://developer.apple.com/documentation/avfaudio/avaudiosession) on iOS.

You can customize the configuration of the audio session with `configureAudio`.

### Media playback

By default, the audio session is set up for bidirectional communication. In this mode, the audio framework exhibits the following behaviors:

- The volume cannot be reduced to 0.
- Echo cancellation is available and is enabled by default.
- A microphone indicator can be displayed, depending on the platform.

If you're leveraging dTelecom primarily for media playback, you have the option to reconfigure the audio session to better suit media playback. Here's how:

Note: iOS audio session customization is in development, and will be documented here when released.

```js
useEffect(() => {
  let connect = async () => {
    // configure audio session prior to starting it.
    await AudioSession.configureAudio({
      android: {
        // currently supports .media and .communication presets
        audioTypeOptions: AndroidAudioTypePresets.media,
      },
    });
    await AudioSession.startAudioSession();
    await room.connect(url, token, {});
  };
  connect();
  return () => {
    room.disconnect();
    AudioSession.stopAudioSession();
  };
}, [url, token, room]);
```

### Customizing audio session

Instead of using our presets, you can further customize the audio session to suit your specific needs.

```js
await AudioSession.configureAudio({
  android: {
    preferredOutputList: ['earpiece'],
    // See [AudioManager](https://developer.android.com/reference/android/media/AudioManager)
    // for details on audio and focus modes.
    audioTypeOptions: {
      manageAudioFocus: true,
      audioMode: 'normal',
      audioFocusMode: 'gain',
      audioStreamType: 'music',
      audioAttributesUsageType: 'media',
      audioAttributesContentType: 'unknown',
    },
  },
});
await AudioSession.startAudioSession();
```

## Screenshare

Enabling screenshare requires extra installation steps:

### Android

Android screenshare requires a foreground service with type `mediaProjection` to be present.

The example app uses [@voximplant/react-native-foreground-service](https://github.com/voximplant/react-native-foreground-service) for this.
Ensure that the service is labelled a `mediaProjection` service like so:

```
<service android:name="com.voximplant.foregroundservice.VIForegroundService"
  android:foregroundServiceType="mediaProjection" />
```

Once setup, start the foreground service prior to using screenshare.

### iOS

iOS screenshare requires adding a Broadcast Extension to your iOS project. Follow the integration instructions here:

https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-ios-sdk/#screen-sharing-integration

It involves copying the files found in this [sample project](https://github.com/jitsi/jitsi-meet-sdk-samples/tree/18c35f7625b38233579ff34f761f4c126ba7e03a/ios/swift-screensharing/JitsiSDKScreenSharingTest/Broadcast%20Extension)
to your iOS project, and registering a Broadcast Extension in Xcode.

It's also recommended to use [CallKeep](https://github.com/react-native-webrtc/react-native-callkeep),
to register a call with CallKit (as well as turning on the `voip` background mode).
Due to background app processing limitations, screen recording may be interrupted if the app is restricted
in the background. Registering with CallKit allows the app to continue processing for the duration of the call.

Once setup, iOS screenshare can be initiated like so:

```js
const screenCaptureRef = React.useRef(null);
const screenCapturePickerView = Platform.OS === 'ios' && (
  <ScreenCapturePickerView ref={screenCaptureRef} />
);
const startBroadcast = async () => {
  if (Platform.OS === 'ios') {
    const reactTag = findNodeHandle(screenCaptureRef.current);
    await NativeModules.ScreenCapturePickerViewManager.show(reactTag);
    room.localParticipant.setScreenShareEnabled(true);
  } else {
    room.localParticipant.setScreenShareEnabled(true);
  }
};

return (
  <View style={styles.container}>
    /*...*/ // Make sure the ScreenCapturePickerView exists in the view tree.
    {screenCapturePickerView}
  </View>
);
```

### Note

You will not be able to publish camera or microphone tracks on iOS Simulator.

## Troubleshooting

#### Cannot read properties of undefined (reading 'split')

This error could happen if you are using yarn and have incompatible versions of dependencies with dtelecom-client.

To fix this, you can either:

- use another package manager, like npm
- use [yarn-deduplicate](https://www.npmjs.com/package/yarn-deduplicate) to deduplicate dependencies

## License

Apache License 2.0
