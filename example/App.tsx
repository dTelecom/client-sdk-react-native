import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StatusBar, Switch, Text, TextInput, View } from 'react-native';
import { createEncryptedRoom, Room } from '@dtelecom/react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { joinInvite, parseInvite, type Admission } from './src/invite';
import { InviteScanner } from './src/InviteScanner';
import { RoomPage } from './src/RoomPage';
import { Action, colors, styles } from './src/ui';

export interface Session {
  room: Room;
  encrypted: boolean;
  roomName: string;
  admission: Admission;
}

function JoinPage() {
  const [session, setSession] = useState<Session>();
  const [link, setLink] = useState('');
  const [identity, setIdentity] = useState('');
  const [encrypted, setEncrypted] = useState(false);
  const [mediaKey, setMediaKey] = useState('');
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [joining, setJoining] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const finishScan = useCallback((invite?: string, message?: string) => {
    if (invite !== undefined) setLink(invite);
    setError(message ?? '');
    setScanning(false);
  }, []);

  async function join(name: string) {
    if (request.current || (encrypted && !mediaKey.length)) return;
    const controller = new AbortController();
    request.current = controller;
    setJoining(true);
    setError('');
    try {
      const invite = parseInvite(link);
      const admission = await joinInvite(invite, name, controller.signal);
      if (controller.signal.aborted) return;
      const options = { adaptiveStream: true, dynacast: true };
      const room = encrypted ? await createEncryptedRoom(mediaKey, options) : new Room(options);
      if (controller.signal.aborted) {
        await room.disconnect();
        return;
      }
      setMediaKey('');
      setSession({ room, roomName: invite.room, admission, encrypted });
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to join.');
    } finally {
      if (request.current === controller) {
        request.current = null;
        setJoining(false);
      }
    }
  }

  if (scanning) return <InviteScanner onClose={finishScan} />;
  if (session) {
    return <RoomPage session={session} onLeave={() => setSession(undefined)} />;
  }
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>Join a room</Text>
      <View style={styles.field}>
        <Text style={styles.label}>Meet or Live invite</Text>
        <TextInput testID="invite" accessibilityLabel="Meet or Live invite" style={styles.input}
          editable={!joining} autoCapitalize="none" autoCorrect={false} keyboardType="url"
          placeholder="Paste an invite link" placeholderTextColor={colors.muted} value={link} onChangeText={setLink} />
        <Action label="Scan QR" disabled={joining} onPress={() => setScanning(true)} />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Your name</Text>
        <TextInput testID="identity" accessibilityLabel="Your name" style={styles.input}
          editable={!joining} value={identity} onChangeText={setIdentity} returnKeyType="go"
          onSubmitEditing={event => join(event.nativeEvent.text)} />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>End-to-end encrypted media</Text>
        <Switch accessibilityLabel="End-to-end encrypted media" disabled={joining}
          value={encrypted} onValueChange={enabled => {
            setEncrypted(enabled);
            if (!enabled) setMediaKey('');
          }} />
        {encrypted && <TextInput accessibilityLabel="Shared media key" secureTextEntry
          autoCapitalize="none" autoCorrect={false} editable={!joining} style={styles.input}
          placeholder="Enter the shared room key" placeholderTextColor={colors.muted}
          value={mediaKey} onChangeText={setMediaKey} />}
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Action label={joining ? 'Joining…' : 'Join room'} onPress={() => join(identity)}
        disabled={joining || !link.trim() || !identity.trim() || (encrypted && !mediaKey.length)} primary />
      {joining && <Action label="Cancel" onPress={() => request.current?.abort()} />}
    </ScrollView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <JoinPage />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
