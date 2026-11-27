# Declarative React Native rooms

Mount `LiveKitRoom` once above your meeting screens. Its children read the same room through `useRoomContext`. Import the provider, hooks, types and rendering components from `@dtelecom/react-native` so they share that context.

```tsx
import {
  LiveKitRoom, Track, VideoTrack, isTrackReference, useTracks,
} from '@dtelecom/react-native';
import type { RoomCredentials } from '@dtelecom/react-native';

export function Meeting({ grant }: { grant: RoomCredentials }) {
  return (
    <LiveKitRoom
      token={grant.token}
      serverUrl={grant.wsUrl}
      fallbackUrls={grant.fallbackUrls}
      options={{ adaptiveStream: { pixelDensity: 'screen', updateDimensions: true } }}
    >
      <Tiles />
    </LiveKitRoom>
  );
}

function Tiles() {
  const tiles = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);
  return tiles.map(ref => isTrackReference(ref) && (
    <VideoTrack key={ref.publication.trackSid} trackRef={ref} useTextureView />
  ));
}
```

The provider starts a connection when `connect` is true and both token and URL are available. It disconnects a connection it started on unmount, credential replacement or when `connect` becomes false. Initial capture defaults to off. Set `audio` or `video` after permissions are granted and before connecting, or toggle capture through `room.localParticipant` after a join. If your application manages a live room itself, pass `room={room} connect={false}` to share it with child hooks.

Use `useLocalParticipant`, `useParticipants`, `useParticipantInfo`, `useIsMuted` and `useIsSpeaking` for participant controls. Track queries can include placeholders for participants with their camera off. `useVisualStableUpdate` keeps tiles in their previous slots when they remain on the same page. Supply your own comparator through `customSortFunction` to apply meeting-specific priorities.

`useDataChannel(topic, onMessage)` filters incoming room data by topic. Its `send(payload, options?)` method publishes reliable bytes on that topic. The existing chat topic is available as `DataTopic.CHAT`. The sender, topic and bytes are available to your callback so your app can handle its own messages.
