import { Participant, RoomEvent, Track } from '@dtelecom/livekit-client';
import type {
  LocalParticipant,
  RemoteParticipant,
  Room,
  TrackPublication,
} from '@dtelecom/livekit-client';
import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  useRef,
} from 'react';
import { useRoomContext } from './components/LiveKitRoom';
import { useParticipant } from './useParticipant';

export type TrackReference = {
  participant: Participant;
  source: Track.Source;
  publication: TrackPublication;
};
export type TrackReferencePlaceholder = {
  participant: Participant;
  source: Track.Source;
  publication?: never;
};
export type TrackReferenceOrPlaceholder =
  | TrackReference
  | TrackReferencePlaceholder;

export function isTrackReference(ref: unknown): ref is TrackReference {
  return (
    typeof ref === 'object' &&
    ref !== null &&
    'participant' in ref &&
    'source' in ref &&
    'publication' in ref &&
    ref.publication != null
  );
}

export const ParticipantContext = createContext<Participant | undefined>(
  undefined
);
export const TrackRefContext = createContext<
  TrackReferenceOrPlaceholder | undefined
>(undefined);

export function useEnsureTrackRef(ref?: TrackReferenceOrPlaceholder) {
  const inherited = useContext(TrackRefContext);
  const track = ref ?? inherited;
  if (!track)
    throw new Error(
      'Supply a track reference or render inside TrackRefContext.'
    );
  return track;
}

function useEnsureParticipant(participant?: Participant) {
  const inherited = useContext(ParticipantContext);
  const result = participant ?? inherited;
  if (!result)
    throw new Error(
      'Supply a participant or render inside ParticipantContext.'
    );
  return result;
}

const roomEvents = [
  RoomEvent.ConnectionStateChanged,
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.Reconnected,
  RoomEvent.TrackPublished,
  RoomEvent.TrackUnpublished,
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.ActiveSpeakersChanged,
  RoomEvent.ParticipantPermissionsChanged,
  RoomEvent.ParticipantNameChanged,
  RoomEvent.ParticipantMetadataChanged,
] as const;

export interface UseParticipantsOptions {
  room?: Room;
  updateOnlyOn?: RoomEvent[];
}

export function useParticipants(
  options: UseParticipantsOptions = {}
): (LocalParticipant | RemoteParticipant)[] {
  const room = useRoomContext(options.room);
  const read = (r: Room) => [r.localParticipant, ...r.participants.values()];
  const [snapshot, setSnapshot] = useState(() => ({
    room,
    participants: read(room),
  }));
  const eventKey = options.updateOnlyOn?.join(',');
  useLayoutEffect(() => {
    const update = () => setSnapshot({ room, participants: read(room) });
    const selected =
      eventKey === undefined
        ? roomEvents
        : eventKey
        ? (eventKey.split(',') as RoomEvent[])
        : [];
    const events = new Set([
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.ConnectionStateChanged,
      ...selected,
    ]);
    for (const event of events) room.on(event, update);
    update();
    return () => {
      for (const event of events) room.off(event, update);
    };
  }, [room, eventKey]);
  return room === snapshot.room ? snapshot.participants : read(room);
}

export interface UseLocalParticipantOptions {
  room?: Room;
}
export function useLocalParticipant(options: UseLocalParticipantOptions = {}) {
  const { localParticipant } = useRoomContext(options.room);
  const state = useParticipant(localParticipant);
  return {
    localParticipant,
    isCameraEnabled: localParticipant.isCameraEnabled,
    isMicrophoneEnabled: localParticipant.isMicrophoneEnabled,
    isScreenShareEnabled: localParticipant.isScreenShareEnabled,
    microphoneTrack: state.microphonePublication,
    cameraTrack: state.cameraPublication,
    lastMicrophoneError: localParticipant.lastMicrophoneError,
    lastCameraError: localParticipant.lastCameraError,
  };
}

export interface UseParticipantInfoOptions {
  participant?: Participant;
}
export function useParticipantInfo(options: UseParticipantInfoOptions = {}) {
  const p = useEnsureParticipant(options.participant);
  useParticipant(p);
  return { identity: p.identity, name: p.name, metadata: p.metadata };
}
export function useIsSpeaking(participant?: Participant) {
  const p = useEnsureParticipant(participant);
  return useParticipant(p).isSpeaking;
}
export function useIsMuted(
  ref: TrackReferenceOrPlaceholder | Track.Source,
  options: UseParticipantInfoOptions = {}
) {
  const p = useEnsureParticipant(
    typeof ref === 'string' ? options.participant : ref.participant
  );
  useParticipant(p);
  const pub =
    typeof ref === 'string'
      ? p.getTrack(ref)
      : ref.publication ?? p.getTrack(ref.source);
  return pub?.isMuted ?? true;
}

export interface UseTracksOptions extends UseParticipantsOptions {
  onlySubscribed?: boolean;
}
export type TrackSourceWithOptions = {
  source: Track.Source;
  withPlaceholder: boolean;
};
const allSources = Object.values(Track.Source);

export function useTracks(
  sources?: readonly Track.Source[],
  options?: UseTracksOptions
): TrackReference[];
export function useTracks(
  sources: readonly (Track.Source | TrackSourceWithOptions)[],
  options?: UseTracksOptions
): TrackReferenceOrPlaceholder[];
export function useTracks(
  sources: readonly (Track.Source | TrackSourceWithOptions)[] = allSources,
  options: UseTracksOptions = {}
) {
  const participants = useParticipants({
    room: options.room,
    updateOnlyOn: [...roomEvents, ...(options.updateOnlyOn ?? [])],
  });
  const result: TrackReferenceOrPlaceholder[] = [];
  for (const participant of participants) {
    for (const entry of sources) {
      const source = typeof entry === 'string' ? entry : entry.source;
      let published = false;
      for (const publication of participant.tracks.values()) {
        if (
          publication.source !== source ||
          (options.onlySubscribed && !publication.isSubscribed)
        )
          continue;
        result.push({ participant, source, publication });
        published = true;
      }
      if (!published && typeof entry !== 'string' && entry.withPlaceholder)
        result.push({ participant, source });
    }
  }
  return result;
}

export function sortParticipantsByJoinedAt(
  a: Pick<Participant, 'joinedAt'>,
  b: Pick<Participant, 'joinedAt'>
) {
  return (a.joinedAt?.getTime() ?? 0) - (b.joinedAt?.getTime() ?? 0);
}
export function sortTrackReferencesByType(
  a: TrackReferenceOrPlaceholder,
  b: TrackReferenceOrPlaceholder
) {
  return Number(isTrackReference(b)) - Number(isTrackReference(a));
}
export function sortTrackRefsByIsCameraEnabled(
  a: TrackReferenceOrPlaceholder,
  b: TrackReferenceOrPlaceholder
) {
  return (
    Number(b.participant.isCameraEnabled) -
    Number(a.participant.isCameraEnabled)
  );
}

export interface UseVisualStableUpdateOptions {
  customSortFunction?: (
    tracks: TrackReferenceOrPlaceholder[]
  ) => TrackReferenceOrPlaceholder[];
}
function defaultOrder(
  a: TrackReferenceOrPlaceholder,
  b: TrackReferenceOrPlaceholder
) {
  return (
    Number(b.source === Track.Source.ScreenShare) -
      Number(a.source === Track.Source.ScreenShare) ||
    Number(b.participant.isSpeaking) - Number(a.participant.isSpeaking) ||
    sortTrackReferencesByType(a, b) ||
    sortTrackRefsByIsCameraEnabled(a, b) ||
    sortParticipantsByJoinedAt(a.participant, b.participant)
  );
}
function trackId(ref: TrackReferenceOrPlaceholder) {
  return JSON.stringify([
    ref.participant.identity,
    ref.source,
    ref.publication?.trackSid,
  ]);
}

export function useVisualStableUpdate(
  references: TrackReferenceOrPlaceholder[],
  pageSize: number,
  options: UseVisualStableUpdateOptions = {}
) {
  const previous = useRef<{ pageSize: number; keys: string[] }>({
    pageSize: 0,
    keys: [],
  });
  const ordered = options.customSortFunction
    ? options.customSortFunction([...references])
    : [...references].sort(defaultOrder);
  const next = [...ordered];
  // The sort determines which page each tile belongs to. Preserve slots within each page.
  if (pageSize > 0 && previous.current.pageSize === pageSize) {
    for (let offset = 0; offset < ordered.length; offset += pageSize) {
      const page = ordered.slice(offset, offset + pageSize);
      const remaining = new Map(page.map((ref) => [trackId(ref), ref]));
      const slots = page.map((_, index) => {
        const key = previous.current.keys[offset + index];
        const ref = remaining.get(key);
        remaining.delete(key);
        return ref;
      });
      const incoming = remaining.values();
      slots.forEach((ref, index) => {
        next[offset + index] = ref ?? incoming.next().value!;
      });
    }
  }
  useLayoutEffect(() => {
    previous.current = { pageSize, keys: next.map(trackId) };
  });
  return next;
}
