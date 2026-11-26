import React, { useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import {
  AudioSession, ConnectionState, connectRoom, DataPacket_Kind, Room, RoomEvent,
  switchCamera, useParticipant, useRoom, VideoView, type Participant, type RemoteParticipant,
} from '@dtelecom/react-native';
import type { Session } from '../App';
import { chatTopic, decodeChat, encodeChat } from './chat';
import { Action, colors, styles } from './ui';

function ParticipantTile({ participant, local, mirror }: {
  participant: Participant; local: boolean; mirror: boolean;
}) {
  const { cameraPublication, screenSharePublication } = useParticipant(participant);
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{participant.name || participant.identity}{local ? ' (you)' : ''}</Text>
      {cameraPublication?.videoTrack && !cameraPublication.isMuted &&
        <VideoView style={styles.video} videoTrack={cameraPublication.videoTrack}
          mirror={local && mirror} objectFit="cover" useTextureView={Platform.OS === 'android'} />}
      {screenSharePublication?.videoTrack && !screenSharePublication.isMuted && <>
        <Text style={styles.detail}>Shared screen</Text>
        <VideoView style={styles.video} videoTrack={screenSharePublication.videoTrack} objectFit="contain" />
      </>}
    </View>
  );
}

export function RoomPage({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const [room] = useState(() => new Room({ adaptiveStream: true, dynacast: true }));
  const { participants, state } = useRoom(room);
  const { cameraPublication, microphonePublication } = useParticipant(room.localParticipant);
  const cameraEnabled = !!cameraPublication && !cameraPublication.isMuted;
  const micEnabled = !!microphonePublication && !microphonePublication.isMuted;
  const [mirror, setMirror] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const action = useRef(false);
  const active = useRef(true);
  const closing = useRef<Promise<void> | null>(null);
  const setup = useRef<Promise<void> | null>(null);
  const [outputs, setOutputs] = useState<string[]>([]);
  const [currentOutput, setCurrentOutput] = useState('');
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<{sender: string; text: string}[]>([]);
  const { admission } = session;

  function report(cause: unknown) {
    if (active.current) setError(cause instanceof Error ? cause.message : 'Unable to complete this action.');
  }

  function close() {
    if (!closing.current) {
      active.current = false;
      closing.current = (async () => {
        try {
          // Cancel an in-flight connection as well as an established room.
          await room.disconnect();
          await setup.current;
        } finally {
          await AudioSession.stopAudioSession();
        }
      })();
    }
    return closing.current;
  }

  useEffect(() => {
    const receive = (bytes: Uint8Array, sender?: RemoteParticipant, _kind?: DataPacket_Kind, topic?: string) => {
      const text = decodeChat(bytes, topic);
      if (text) setMessages(previous => [...previous, { sender: sender?.name || sender?.identity || 'Participant', text }]);
    };
    room.on(RoomEvent.DataReceived, receive);
    const routes = AudioSession.addAudioRouteChangeListener(route => {
      if (!active.current) return;
      setCurrentOutput(route.selectedOutput);
      if (Platform.OS === 'android') setOutputs(route.availableOutputs);
    });
    setup.current = (async () => {
      await AudioSession.startAudioSession();
      if (!active.current) return;
      await connectRoom(room, admission);
      if (!active.current) return;
      const [actions, route] = await Promise.all([AudioSession.getAudioOutputs(), AudioSession.getAudioRoute()]);
      if (active.current) {
        setOutputs(actions);
        setCurrentOutput(route.selectedOutput);
      }
    })().catch(report);

    let restoreCamera = false;
    let cameraWork = Promise.resolve();
    const appState = AppState.addEventListener('change', next => {
      cameraWork = cameraWork.then(async () => {
        if (!active.current || room.state !== ConnectionState.Connected) return;
        if (next === 'background' && room.localParticipant.isCameraEnabled) {
          restoreCamera = true;
          await room.localParticipant.setCameraEnabled(false);
        } else if (next === 'active' && restoreCamera) {
          restoreCamera = false;
          await room.localParticipant.setCameraEnabled(true);
        }
      }).catch(report);
    });
    return () => {
      appState.remove();
      routes.remove();
      room.off(RoomEvent.DataReceived, receive);
      close().catch(() => {});
    };
    // Session and room are immutable for this mounted screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, admission]);

  async function perform(operation: () => Promise<unknown>) {
    if (action.current || !active.current) return;
    action.current = true;
    setBusy(true);
    setError('');
    try { await operation(); } catch (cause) { report(cause); }
    finally {
      action.current = false;
      if (active.current) setBusy(false);
    }
  }

  const connected = state === ConnectionState.Connected;
  const disabled = busy || leaving || !connected;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={styles.title}>{session.roomName}</Text>
      <Text style={styles.detail}>{admission.role} · {state}</Text>
      <Action label={leaving ? 'Leaving…' : 'Leave room'} disabled={leaving} onPress={async () => {
        setLeaving(true);
        try { await close(); } catch (cause) { report(cause); } finally { onLeave(); }
      }} />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {admission.role !== 'viewer' &&
        <View style={styles.row}>
          <Action label={micEnabled ? 'Mute mic' : 'Start mic'} disabled={disabled}
            onPress={() => perform(() => room.localParticipant.setMicrophoneEnabled(!micEnabled))} />
          <Action label={cameraEnabled ? 'Stop camera' : 'Start camera'} disabled={disabled}
            onPress={() => perform(() => room.localParticipant.setCameraEnabled(!cameraEnabled))} />
          {cameraEnabled && <Action label="Flip camera" disabled={disabled}
            onPress={() => perform(async () => setMirror(await switchCamera(room) === 'user'))} />}
        </View>}
      <View style={styles.row}>
        <Action label="Audio outputs" disabled={disabled} onPress={() => perform(async () => {
          if (Platform.OS === 'ios') {
            await AudioSession.showAudioRoutePicker();
          } else {
            if (Platform.OS === 'android' && Number(Platform.Version) >= 31) {
              await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
            }
            setOutputs(await AudioSession.getAudioOutputs());
          }
        })} />
        {currentOutput ? <Text style={styles.detail}>Using {currentOutput}</Text> : null}
        {outputs.map(output => <Action key={output} label={output.replace(/_/g, ' ')} disabled={disabled}
          onPress={() => perform(() => AudioSession.selectAudioOutput(output))} />)}
      </View>
      {participants.map(participant =>
        <ParticipantTile key={participant.sid || participant.identity} participant={participant}
          local={participant === room.localParticipant} mirror={mirror} />)}
      <Text accessibilityRole="header" style={styles.section}>Room chat</Text>
      {messages.map((message, index) => <Text key={index} style={styles.label}>{message.sender}: {message.text}</Text>)}
      <TextInput style={styles.input} accessibilityLabel="Chat message" placeholder="Message the room"
        placeholderTextColor={colors.muted} value={draft} onChangeText={setDraft} editable={!disabled} />
      <Action label="Send" disabled={disabled || !draft.trim()} primary onPress={() => perform(async () => {
        const text = draft.trim();
        await room.localParticipant.publishData(encodeChat(text), DataPacket_Kind.RELIABLE, { topic: chatTopic });
        if (active.current) {
          setMessages(previous => [...previous, { sender: 'You', text }]);
          setDraft('');
        }
      })} />
    </ScrollView>
  );
}
