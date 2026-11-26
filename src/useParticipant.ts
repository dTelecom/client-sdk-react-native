import {
  ConnectionQuality,
  LocalParticipant,
  Participant,
  ParticipantEvent,
  Track,
  TrackPublication,
} from '@dtelecom/livekit-client';
import { useCallback, useEffect, useState } from 'react';

export interface ParticipantState {
  isSpeaking: boolean;
  connectionQuality: ConnectionQuality;
  isLocal: boolean;
  metadata?: string;
  publications: TrackPublication[];
  subscribedTracks: TrackPublication[];
  cameraPublication?: TrackPublication;
  microphonePublication?: TrackPublication;
  screenSharePublication?: TrackPublication;
}

export function useParticipant(participant: Participant): ParticipantState {
  const readState = useCallback((): ParticipantState => {
    const publications = Array.from(participant.tracks.values());
    return {
      isLocal: participant instanceof LocalParticipant,
      isSpeaking: participant.isSpeaking,
      connectionQuality: participant.connectionQuality,
      metadata: participant.metadata,
      publications,
      subscribedTracks: publications.filter(
        (p) => p.isSubscribed && p.track !== undefined
      ),
      cameraPublication: participant.getTrack(Track.Source.Camera),
      microphonePublication: participant.getTrack(Track.Source.Microphone),
      screenSharePublication: participant.getTrack(Track.Source.ScreenShare),
    };
  }, [participant]);
  const [state, setState] = useState(readState);
  useEffect(() => {
    const update = () => setState(readState());
    const events = [
      ParticipantEvent.TrackMuted,
      ParticipantEvent.TrackUnmuted,
      ParticipantEvent.IsSpeakingChanged,
      ParticipantEvent.ParticipantMetadataChanged,
      ParticipantEvent.ConnectionQualityChanged,
      ParticipantEvent.TrackPublished,
      ParticipantEvent.TrackUnpublished,
      ParticipantEvent.TrackSubscribed,
      ParticipantEvent.TrackUnsubscribed,
      ParticipantEvent.LocalTrackPublished,
      ParticipantEvent.LocalTrackUnpublished,
    ] as const;
    events.forEach((event) => participant.on(event, update));
    update();
    return () => {
      events.forEach((event) => participant.off(event, update));
    };
  }, [participant, readState]);
  return state;
}
