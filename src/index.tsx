import './textEncoding';
import { registerGlobals as registerWebRTC } from '@dtelecom/react-native-webrtc';
import type { LiveKitReactNativeInfo } from '@dtelecom/livekit-client';
import { PixelRatio, Platform } from 'react-native';
import { setupURLPolyfill } from 'react-native-url-polyfill';

let registered = false;

/** Call once at app startup, before constructing a Room. */
export function registerGlobals(): void {
  if (registered) return;
  registerWebRTC();
  setupURLPolyfill();
  const platform: LiveKitReactNativeInfo = {
    platform: Platform.OS,
    devicePixelRatio: PixelRatio.get(),
  };
  Object.assign(globalThis, { LiveKitReactNativeGlobal: platform });
  // The room client also reads the browser-style user agent during signaling.
  const navigator = globalThis.navigator;
  if (navigator.userAgent === undefined) {
    Object.assign(navigator, { userAgent: navigator.product ?? 'ReactNative' });
  }
  registered = true;
}

export * from './components/VideoView';
export * from './useParticipant';
export * from './useRoom';
export * from './connectRoom';
export * from './switchCamera';
export {
  default as AudioSession,
  AndroidAudioTypePresets,
} from './audio/AudioSession';
export type {
  AudioConfiguration,
  AndroidAudioTypeOptions,
  AudioOutput,
  AudioRoute,
} from './audio/AudioSession';

export {
  Room,
  RoomEvent,
  ConnectionState,
  ParticipantEvent,
  ConnectionQuality,
  DataPacket_Kind,
  DisconnectReason,
  Track,
  TrackEvent,
  LocalParticipant,
  LocalVideoTrack,
  RemoteVideoTrack,
  Participant,
  RemoteParticipant,
  TrackPublication,
} from '@dtelecom/livekit-client';
export type { RoomConnectOptions, VideoTrack } from '@dtelecom/livekit-client';
