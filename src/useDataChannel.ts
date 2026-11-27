import { DataPacket_Kind, RoomEvent } from '@dtelecom/livekit-client';
import type {
  DataPublishOptions,
  RemoteParticipant,
} from '@dtelecom/livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRoomContext } from './components/LiveKitRoom';

export const DataTopic = {
  CHAT: 'lk-chat-topic',
  CHAT_TRANSCRIPTION: 'lk-transcription-topic',
} as const;
export interface ReceivedDataMessage<T extends string = string> {
  topic?: T;
  from?: RemoteParticipant;
  payload: Uint8Array;
}

type DataListener<T extends string> = (message: ReceivedDataMessage<T>) => void;
interface Channel<T extends string> {
  message?: ReceivedDataMessage<T>;
  isSending: boolean;
  send: (payload: Uint8Array, options?: DataPublishOptions) => Promise<void>;
}

export function useDataChannel<T extends string>(
  topic: T,
  onMessage?: DataListener<T>
): Channel<T>;
export function useDataChannel(
  onMessage?: DataListener<string>
): Channel<string>;
export function useDataChannel<T extends string>(
  topicOrListener?: T | DataListener<T>,
  listener?: DataListener<T>
): Channel<T> {
  const room = useRoomContext();
  const topic =
    typeof topicOrListener === 'string' ? topicOrListener : undefined;
  const onMessage = useRef(listener);
  onMessage.current =
    typeof topicOrListener === 'function' ? topicOrListener : listener;
  const [message, setMessage] = useState<ReceivedDataMessage<T>>();
  const [pending, setPending] = useState(0);
  useEffect(() => {
    setMessage(undefined);
    const receive = (
      payload: Uint8Array,
      from?: RemoteParticipant,
      _kind?: DataPacket_Kind,
      receivedTopic?: string
    ) => {
      if (topic !== undefined && receivedTopic !== topic) return;
      const received = { payload, from, topic: receivedTopic as T | undefined };
      setMessage(received);
      onMessage.current?.(received);
    };
    room.on(RoomEvent.DataReceived, receive);
    return () => {
      room.off(RoomEvent.DataReceived, receive);
    };
  }, [room, topic]);
  const send = useCallback(
    async (payload: Uint8Array, options: DataPublishOptions = {}) => {
      setPending((n) => n + 1);
      try {
        await room.localParticipant.publishData(
          payload,
          DataPacket_Kind.RELIABLE,
          { ...options, topic: options.topic ?? topic }
        );
      } finally {
        setPending((n) => n - 1);
      }
    },
    [room, topic]
  );
  return { message, send, isSending: pending > 0 };
}
