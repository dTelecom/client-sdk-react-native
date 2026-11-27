import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {
  ConnectionState,
  MediaDeviceFailure,
  Room,
  RoomEvent,
} from '@dtelecom/livekit-client';
import type {
  AudioCaptureOptions,
  DisconnectReason,
  RoomConnectOptions,
  RoomOptions,
  ScreenShareCaptureOptions,
  VideoCaptureOptions,
} from '@dtelecom/livekit-client';
import { connectRoom } from '../connectRoom';

export const RoomContext = createContext<Room | undefined>(undefined);

export function useRoomContext(roomOverride?: Room): Room {
  const inherited = useContext(RoomContext);
  const room = roomOverride ?? inherited;
  if (!room)
    throw new Error('Mount LiveKitRoom or supply a Room to this hook.');
  return room;
}

export interface LiveKitRoomProps {
  serverUrl?: string;
  token?: string;
  room?: Room;
  /** Constructor options for an internally created Room. Remount to replace it. */
  options?: RoomOptions;
  connect?: boolean;
  connectOptions?: RoomConnectOptions;
  fallbackUrls?: string[];
  /** Initial publication preferences, applied on join. */
  audio?: AudioCaptureOptions | boolean;
  video?: VideoCaptureOptions | boolean;
  screen?: ScreenShareCaptureOptions | boolean;
  onConnected?: () => void;
  onDisconnected?: (reason?: DisconnectReason) => void;
  onError?: (error: Error) => void;
  onMediaDeviceFailure?: (failure?: MediaDeviceFailure) => void;
  onEncryptionError?: (error: Error) => void;
}

export function LiveKitRoom(props: React.PropsWithChildren<LiveKitRoomProps>) {
  const { room: suppliedRoom, serverUrl, token, connect = true } = props;
  const current = useRef(props);
  current.current = props;
  const room = useMemo(
    () => suppliedRoom ?? new Room(current.current.options),
    [suppliedRoom]
  );
  const leaving = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!connect || !serverUrl || !token) return;
    let active = true;
    let started = false;
    const onConnected = () => current.current.onConnected?.();
    const onDisconnected = (reason?: DisconnectReason) =>
      current.current.onDisconnected?.(reason);
    const onEncryptionError = (e: Error) =>
      current.current.onEncryptionError?.(e);
    const onMediaError = (e: Error) =>
      current.current.onMediaDeviceFailure?.(MediaDeviceFailure.getFailure(e));
    const report = (e: unknown) => {
      if (active)
        current.current.onError?.(
          e instanceof Error ? e : new Error(String(e))
        );
    };

    async function join(url: string, grant: string) {
      await leaving.current;
      if (!active) return;
      room.on(RoomEvent.Connected, onConnected);
      room.on(RoomEvent.Disconnected, onDisconnected);
      room.on(RoomEvent.MediaDevicesError, onMediaError);
      room.on(RoomEvent.EncryptionError, onEncryptionError);
      // An already active caller-owned room may also be used just as a provider.
      if (suppliedRoom && room.state !== ConnectionState.Disconnected) return;

      started = true;
      const { connectOptions, fallbackUrls } = current.current;
      await connectRoom(
        room,
        {
          wsUrl: url,
          token: grant,
          fallbackUrls: fallbackUrls ?? connectOptions?.fallbackUrls,
        },
        connectOptions
      );
      if (!active) return;
      const { audio, video, screen } = current.current;
      const local = room.localParticipant;
      await Promise.all([
        audio &&
          local.setMicrophoneEnabled(true, audio === true ? undefined : audio),
        video &&
          local.setCameraEnabled(true, video === true ? undefined : video),
        screen &&
          local.setScreenShareEnabled(
            true,
            screen === true ? undefined : screen
          ),
      ]);
    }

    join(serverUrl, token).catch(report);
    return () => {
      active = false;
      room.off(RoomEvent.Connected, onConnected);
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.MediaDevicesError, onMediaError);
      room.off(RoomEvent.EncryptionError, onEncryptionError);
      if (started) leaving.current = room.disconnect();
    };
  }, [connect, room, serverUrl, token, suppliedRoom]);

  return (
    <RoomContext.Provider value={room}>{props.children}</RoomContext.Provider>
  );
}
