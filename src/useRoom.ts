import {
  AudioTrack,
  ConnectionState,
  LocalParticipant,
  Participant,
  Room,
  RoomEvent,
} from '@dtelecom/livekit-client';
import { useCallback, useEffect, useState } from 'react';

export interface RoomState {
  room: Room;
  state: ConnectionState;
  /* all participants in the room, including the local participant. */
  participants: Participant[];
  /* all subscribed audio tracks in the room, not including local participant. */
  audioTracks: AudioTrack[];
  error?: Error;
}

export interface RoomOptions {
  sortParticipants?: (participants: Participant[]) => void;
}

export function useRoom(room: Room, options?: RoomOptions): RoomState {
  const sort = options?.sortParticipants ?? sortParticipants;
  const readState = useCallback(() => {
    const participants: Participant[] = [
      room.localParticipant,
      ...room.participants.values(),
    ];
    sort(participants, room.localParticipant);
    const audioTracks: AudioTrack[] = [];
    room.participants.forEach((participant) => {
      participant.audioTracks.forEach((publication) => {
        if (publication.audioTrack) audioTracks.push(publication.audioTrack);
      });
    });
    return { room, participants, audioTracks, state: room.state };
  }, [room, sort]);
  const [state, setState] = useState(readState);

  useEffect(() => {
    const update = () => setState(readState());
    const events = [
      RoomEvent.ConnectionStateChanged,
      RoomEvent.Reconnected,
      RoomEvent.Disconnected,
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.ActiveSpeakersChanged,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.AudioPlaybackStatusChanged,
    ] as const;
    events.forEach((event) => room.on(event, update));
    update();
    return () => {
      events.forEach((event) => room.off(event, update));
    };
  }, [room, readState]);
  return state;
}

/**
 * Default sort for participants, it'll order participants by:
 * 1. dominant speaker (speaker with the loudest audio level)
 * 2. local participant
 * 3. other speakers that are recently active
 * 4. participants with video on
 * 5. by joinedAt
 */
export function sortParticipants(
  participants: Participant[],
  localParticipant?: LocalParticipant
) {
  participants.sort((a, b) => {
    // loudest speaker first
    if (a.isSpeaking && b.isSpeaking) {
      return b.audioLevel - a.audioLevel;
    }

    // speaker goes first
    if (a.isSpeaking !== b.isSpeaking) {
      if (a.isSpeaking) {
        return -1;
      } else {
        return 1;
      }
    }

    // last active speaker first
    if (a.lastSpokeAt !== b.lastSpokeAt) {
      const aLast = a.lastSpokeAt?.getTime() ?? 0;
      const bLast = b.lastSpokeAt?.getTime() ?? 0;
      return bLast - aLast;
    }

    // video on
    const aVideo = a.videoTracks.size > 0;
    const bVideo = b.videoTracks.size > 0;
    if (aVideo !== bVideo) {
      if (aVideo) {
        return -1;
      } else {
        return 1;
      }
    }

    // joinedAt
    return (a.joinedAt?.getTime() ?? 0) - (b.joinedAt?.getTime() ?? 0);
  });

  if (localParticipant) {
    const localIdx = participants.indexOf(localParticipant);
    if (localIdx >= 0) {
      participants.splice(localIdx, 1);
      if (participants.length > 0) {
        participants.splice(1, 0, localParticipant);
      } else {
        participants.push(localParticipant);
      }
    }
  }
}
