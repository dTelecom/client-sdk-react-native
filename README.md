# dTelecom React Native SDK

The dTelecom React Native SDK 2.1 for iOS and Android connects to dTelecom rooms, publishes camera and microphone tracks, renders remote video and exchanges room data. It uses the same room client as dTelecom web apps. The [iOS and Android example app](example/README.md) joins [Meet meetings](https://dtelecom-meet.vercel.app/) and [Live streams](https://dtelecom-live.vercel.app/) using the browser’s invite link or QR code. In both apps, mobile participants can hear desktop audio and see camera video and shared screens.

## Install

Use React Native 0.86, React 19.2.3 and Node 22.13 or later within Node 22. The SDK supports iOS 15.1 or later and Android API 24 or later. npm resolves its pinned room client (1.13.0) and WebRTC bridge (150.2.0) automatically.

```sh
npm install @dtelecom/react-native@2.1.0
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

## Room UI, encrypted media and native integrations

Use the [room provider, track and data hooks](docs/room-components.md) to share a room across React components. For encrypted meetings or broadcasts, supply the same media key to each participant. Apps manage their own key delivery. [Encrypted audio and video](docs/encrypted-media.md)

Incoming calls are optional. Apps that use system calling supply their own push delivery and connect native call events to the room. Apps that process microphone audio can register a capture processor. [System calling](docs/system-calls.md) · [Microphone processing](docs/capture-processing.md)

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
