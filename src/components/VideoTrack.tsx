import React from 'react';
import type { VideoTrack as RoomVideoTrack } from '@dtelecom/livekit-client';
import { Track } from '@dtelecom/livekit-client';
import type { TrackReferenceOrPlaceholder } from '../roomTracks';
import { VideoView, type Props as VideoViewProps } from './VideoView';

/** The media-track type retained for existing imperative SDK consumers. */
export type VideoTrack = RoomVideoTrack;

export interface VideoTrackProps
  extends Omit<VideoViewProps, 'videoTrack' | 'cameraDeviceId'> {
  trackRef?: TrackReferenceOrPlaceholder;
  cameraId?: { facing: 'front' | 'environment'; deviceId: string };
  isScreenShare?: boolean;
  isLocal?: boolean;
}

export function VideoTrack({
  trackRef,
  cameraId,
  isScreenShare,
  isLocal = trackRef?.participant.isLocal,
  ...props
}: VideoTrackProps): React.ReactElement {
  const sharing =
    isScreenShare ?? trackRef?.source === Track.Source.ScreenShare;
  return (
    <VideoView
      {...props}
      videoTrack={trackRef?.publication?.videoTrack}
      cameraDeviceId={isLocal && !sharing ? cameraId?.deviceId : undefined}
      objectFit={sharing ? 'contain' : props.objectFit}
    />
  );
}
