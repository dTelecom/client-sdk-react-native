# Encrypted audio and video

Enable media E2EE on a room by supplying the same nonempty key string to each participant. A two-person call and a group meeting use the same API. For a livestream, the host uses the key when publishing, and each viewer uses it when subscribing. A viewer’s RTC grant still controls publishing permission. The app supplies the key separately from the grant.

In the Rooms example, enter the test string locally on each device before joining. To include a browser, its room client must also enable E2EE and receive the same string. The current Meet and Live web pages do not offer key entry.

```ts
import { connectRoom, createEncryptedRoom } from '@dtelecom/react-native';

const room = await createEncryptedRoom(mediaKey, { adaptiveStream: true });
try {
  await connectRoom(room, { wsUrl, token, fallbackUrls });
  await room.localParticipant.setMicrophoneEnabled(true);
} catch (error) {
  await room.disconnect();
  throw error;
}
```

Keep the normal microphone permissions and audio-session setup used by your app. A definitive disconnect ends this encrypted room. Construct a new room for a subsequent call. The key string is used exactly as supplied. Every participant must use the same value, including case, whitespace and any base64 padding.

If your application receives its key after room creation, call `createRoomEncryption()` and give the resulting controller to `new Room({ nativeEncryption: controller })`. Call `await controller.setKey(mediaKey)` before publishing media. Observe `RoomEvent.EncryptionError` to report failed decryption or encryption setup. Key exchange and storage belong to the host application. Room chat and data messages have their own transport and application protocols.

The Rooms example accepts the test key before joining a meeting or broadcast. [Rooms example](../example/README.md#test-encrypted-media-between-two-phones)

### Join from a browser app

Serve the worker from the same version of `@dtelecom/livekit-client` that the browser app imports. For an app that serves static files from `public/`, copy the packaged worker during its build.

```sh
cp "$(node -p "require.resolve('@dtelecom/livekit-client/e2ee-worker')")" public/rtc-e2ee-worker.js
```

```ts
import { ExternalE2EEKeyProvider, Room, RoomEvent } from '@dtelecom/livekit-client';

const keyProvider = new ExternalE2EEKeyProvider();
const worker = new Worker('/rtc-e2ee-worker.js');
const room = new Room({ e2ee: { keyProvider, worker } });
// The page provides a hidden status message with role="alert".
const notice = document.getElementById('media-encryption-error');
room.on(RoomEvent.EncryptionError, () => {
  if (notice) notice.hidden = false;
});
await keyProvider.setKey(mediaKey);
await room.setE2EEEnabled(true);
await room.connect(wsUrl, token, { fallbackUrls });
```

Use the regular guest or host grant for a meeting. For a stream, only the host publishes. Each viewer can run the same setup and subscribe while the broadcast is in progress. On teardown, disconnect the room and terminate the worker your app created.

### Compare matching and different keys

Publish a recognizable moving image and a known test tone. First join with the publisher’s key and confirm the picture and sound. Then have another viewer join using a different key. The browser may display distorted frames, produce noise or show no picture. In each case, check whether that viewer can reproduce the original picture or tone.

Observe `RoomEvent.EncryptionError` alongside connection state. A persistent decryption error while the room is connected can tell the viewer to check the shared room key. Track replacement during reconnect can also produce transient browser encryption errors.

On React Native, a `RemoteAudioDecryptionError` identifies the incoming audio track. Match `error.track` to the remote publication’s `track.mediaStreamTrack` and check its current mute state before displaying a key warning. Silence packets can trigger this event while a remote microphone is muting or leaving. Remove its warning when the microphone is muted, the publication disappears, or `error.recovered` resolves. The promise resolves when the receiver decrypts successfully again, its publication is replaced, or its transport is released. A new microphone publication starts with the current room key and its own decryption state, even when WebRTC reuses the same receiver.

On Android, if the sender corrects its key while its microphone is still published, the receiver retries its current room key for that audio track. The warning clears when a frame decrypts successfully. Neither participant needs to rejoin or republish the microphone.
