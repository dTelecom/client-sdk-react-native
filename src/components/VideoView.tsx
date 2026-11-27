import {
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import {
  ElementInfo,
  LocalVideoTrack,
  Track,
  TrackEvent,
  VideoTrack,
} from '@dtelecom/livekit-client';
import { RTCView } from '@dtelecom/react-native-webrtc';
import React, { useCallback, useEffect, useState } from 'react';
import { RemoteVideoTrack } from '@dtelecom/livekit-client';
import ViewPortDetector from './ViewPortDetector';

export type Props = {
  videoTrack?: VideoTrack | undefined;
  /** Only render this local camera while a lens switch is in progress. */
  cameraDeviceId?: string;
  style?: StyleProp<ViewStyle>;
  objectFit?: 'cover' | 'contain' | undefined;
  mirror?: boolean;
  zOrder?: number;
  /** Android. Composite this track into the view hierarchy for rounded or overlapping tiles. */
  useTextureView?: boolean;
};

export const VideoView = ({
  style = {},
  videoTrack,
  cameraDeviceId,
  objectFit = 'cover',
  zOrder,
  mirror,
  useTextureView,
}: Props): React.ReactElement => {
  const [elementInfo] = useState(() => new VideoViewElementInfo());
  const onVisibility = useCallback(
    (visible: boolean) => elementInfo.onVisibility(visible),
    [elementInfo]
  );
  const adaptive =
    videoTrack instanceof RemoteVideoTrack && videoTrack.isAdaptiveStream;
  const [mediaStream, setMediaStream] = useState(videoTrack?.mediaStream);
  useEffect(() => {
    setMediaStream(videoTrack?.mediaStream);
    if (videoTrack instanceof LocalVideoTrack) {
      const onRestarted = (track: Track | null) => {
        setMediaStream(track?.mediaStream);
      };
      videoTrack.on(TrackEvent.Restarted, onRestarted);

      return () => {
        videoTrack.off(TrackEvent.Restarted, onRestarted);
      };
    }
    return undefined;
  }, [videoTrack]);

  useEffect(() => {
    if (videoTrack instanceof RemoteVideoTrack && videoTrack.isAdaptiveStream) {
      videoTrack?.observeElementInfo(elementInfo);
      return () => {
        videoTrack?.stopObservingElementInfo(elementInfo);
      };
    }
    return undefined;
  }, [videoTrack, elementInfo]);

  const camera = mediaStream?.getVideoTracks()[0];
  if (
    cameraDeviceId &&
    camera?.getSettings()?.deviceId !== cameraDeviceId &&
    camera?.getConstraints()?.deviceId !== cameraDeviceId
  )
    return <View style={style} />;

  return (
    <View
      style={style}
      onLayout={(event) => {
        elementInfo.onLayout(event);
      }}
    >
      <ViewPortDetector
        disabled={!adaptive}
        onChange={onVisibility}
        style={styles.videoView}
      >
        <RTCView
          style={styles.videoView}
          streamURL={(
            mediaStream as
              | (typeof mediaStream & { toURL(): string })
              | undefined
          )?.toURL()}
          objectFit={objectFit}
          zOrder={zOrder}
          mirror={mirror}
          useTextureView={useTextureView}
        />
      </ViewPortDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  videoView: {
    flex: 1,
    width: '100%',
  },
});

class VideoViewElementInfo implements ElementInfo {
  element: object = {};
  _width = 0;
  _height = 0;
  _observing = false;
  visible: boolean = true;
  visibilityChangedAt: number | undefined;
  pictureInPicture = false;
  handleResize?: (() => void) | undefined;
  handleVisibilityChanged?: (() => void) | undefined;
  width = () => this._width;
  height = () => this._height;

  observe(): void {
    this._observing = true;
  }
  stopObserving(): void {
    this._observing = false;
  }

  onLayout(event: LayoutChangeEvent) {
    let { width, height } = event.nativeEvent.layout;
    this._width = width;
    this._height = height;

    if (this._observing) {
      this.handleResize?.();
    }
  }
  onVisibility(isVisible: boolean) {
    if (this.visible !== isVisible) {
      this.visible = isVisible;
      this.visibilityChangedAt = Date.now();
      if (this._observing) {
        this.handleVisibilityChanged?.();
      }
    }
  }
}
