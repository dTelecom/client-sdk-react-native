import {useState} from 'react';
import {Button, Text} from 'react-native';
import {
  AudioSession,
  DataTopic,
  LiveKitRoom,
  LogLevel,
  Track,
  VideoTrack,
  VideoView,
  isTrackReference,
  setLogLevel,
  sortParticipantsByJoinedAt,
  sortTrackReferencesByType,
  sortTrackRefsByIsCameraEnabled,
  useDataChannel,
  useEnsureTrackRef,
  useIsMuted,
  useIsSpeaking,
  useLocalParticipant,
  useParticipantInfo,
  useParticipants,
  useRoomContext,
  useTracks,
  useVisualStableUpdate,
} from '@dtelecom/react-native';
import type {
  AudioOutput,
  AudioRoute,
  LocalParticipant,
  ReceivedDataMessage,
  TrackReferenceOrPlaceholder,
} from '@dtelecom/react-native';

export function GroupRoom({
  grant,
  url,
  alternatives,
}: {
  grant: string;
  url: string;
  alternatives: string[];
}) {
  return (
    <LiveKitRoom
      token={grant}
      serverUrl={url}
      fallbackUrls={alternatives}
      audio
      options={{
        adaptiveStream: {pixelDensity: 'screen', updateDimensions: true},
      }}>
      <Meeting />
    </LiveKitRoom>
  );
}

function Meeting() {
  const room = useRoomContext();
  const participants = useParticipants().sort(sortParticipantsByJoinedAt);
  const {localParticipant, cameraTrack} = useLocalParticipant();
  const local: LocalParticipant = localParticipant;
  const refs = useTracks([
    {source: Track.Source.Camera, withPlaceholder: true},
    {source: Track.Source.ScreenShare, withPlaceholder: false},
  ]);
  const ordered = useVisualStableUpdate(refs, 2, {
    customSortFunction: tiles =>
      tiles.sort(
        (a, b) =>
          sortTrackReferencesByType(a, b) ||
          sortTrackRefsByIsCameraEnabled(a, b),
      ),
  });
  const [lastSender, setLastSender] = useState('');
  const {send} = useDataChannel(
    DataTopic.CHAT,
    (message: ReceivedDataMessage<string>) => {
      if (message.from && message.from.identity !== local.identity) {
        setLastSender(message.from.identity);
      }
    },
  );
  if (!participants.length) return null;
  const legacyType: VideoTrack | undefined = cameraTrack?.videoTrack;
  return (
    <>
      <Text>
        {room.name} · {lastSender}
      </Text>
      <VideoView videoTrack={legacyType} />
      {ordered.map(ref => (
        <Tile key={ref.participant.identity + ref.source} trackRef={ref} />
      ))}
      <Button title="Send room data" onPress={() => send(Uint8Array.of(1))} />
    </>
  );
}

function Tile({trackRef}: {trackRef: TrackReferenceOrPlaceholder}) {
  const ref = useEnsureTrackRef(trackRef);
  const {identity} = useParticipantInfo({participant: ref.participant});
  const muted = useIsMuted(ref);
  const speaking = useIsSpeaking(ref.participant);
  if (!identity || !isTrackReference(ref) || muted) return null;
  return (
    <VideoTrack
      trackRef={ref}
      isLocal={ref.participant.isLocal}
      cameraId={undefined}
      mirror={false}
      useTextureView
      zOrder={speaking ? 1 : 0}
      isScreenShare={ref.source === Track.Source.ScreenShare}
    />
  );
}

export function deviceSetup(route: AudioRoute, output: AudioOutput) {
  setLogLevel(LogLevel.debug);
  if (route.availableOutputs.includes(output))
    return AudioSession.selectAudioOutput(output);
  return Promise.resolve(false);
}
