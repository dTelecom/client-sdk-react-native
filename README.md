# dTelecom React Native SDK

The dTelecom React Native SDK 2.0 for iOS and Android connects to dTelecom rooms, publishes camera and microphone tracks, renders remote video and exchanges room data. It uses the same room client as dTelecom web apps. The [example app](example/README.md) accepts dTelecom Meet and Live invites.

## Install

Use React Native 0.86, React 19.2.3 and Node 22.13 or later within Node 22. The SDK supports iOS 15.1 or later and Android API 24 or later. npm resolves its pinned room client (1.12.28) and WebRTC bridge (150.2.0-preview.0) automatically.

```sh
npm install @dtelecom/react-native@2.0.1
```

To test a local wrapper build, use its tarball path in the install command. npm downloads both peers from the registry.

```sh
npm install --no-save /absolute/path/to/dtelecom-react-native-2.0.1.tgz
```

On iOS, include both sources in your Podfile and run `bundle exec pod install` from the iOS directory. The first source supplies the pinned WebRTC binary. Add camera and microphone usage descriptions if the app offers capture.

```ruby
source 'https://github.com/livekit/podspecs.git'
source 'https://cdn.cocoapods.org/'
```

On Android, initialize the bridge from `MainApplication.onCreate()` before React Native loads. Request microphone or camera permission when the participant chooses to publish. On Android 12 or later, request Bluetooth connect permission when offering Bluetooth routing.

```kotlin
import com.livekit.reactnative.DTelecomReactNative

override fun onCreate() {
    super.onCreate()
    DTelecomReactNative.setup(this)
    loadReactNative(this)
}
```

## Join a room

Call `registerGlobals()` in the application entry point before creating a room. Your backend obtains the participant token and returns its signaling URL and optional ranked alternatives. Keep Cloud credentials on the backend. Pass the issuer's complete list to `connectRoom` so a reachable alternate can accept the same token.

```tsx
import { AudioSession, connectRoom, registerGlobals, Room } from '@dtelecom/react-native';
import type { RoomCredentials } from '@dtelecom/react-native';

registerGlobals();

export async function joinRoom(credentials: RoomCredentials) {
  const room = new Room();
  await AudioSession.startAudioSession();
  try {
    await connectRoom(room, credentials);
    return room;
  } catch (error) {
    await room.disconnect();
    await AudioSession.stopAudioSession();
    throw error;
  }
}
```

Joining leaves capture under the app's control. After the participant grants permission, call `room.localParticipant.setMicrophoneEnabled(true)` or `setCameraEnabled(true)`. Pass a subscribed video track to `<VideoView videoTrack={track} />`. On Android, `useTextureView` supports overlapping or clipped tiles. On leave, disconnect the room and stop the audio session.

The example includes the invite exchange, publish controls, viewer playback, chat and audio routing. The 1.x SDK and its 104.x bridge are legacy releases. [Example app](example/README.md) · [SDK catalog](https://docs.dtelecom.org/reference/sdks/)

## License

Apache License 2.0. [License](LICENSE) · [Third-party notices](NOTICE)
