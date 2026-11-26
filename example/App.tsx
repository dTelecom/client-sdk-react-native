import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StatusBar, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { joinInvite, parseInvite, type Admission } from './src/invite';
import { InviteScanner } from './src/InviteScanner';
import { RoomPage } from './src/RoomPage';
import { Action, colors, styles } from './src/ui';

export interface Session {
  roomName: string;
  admission: Admission;
}

function JoinPage() {
  const [session, setSession] = useState<Session>();
  const [link, setLink] = useState('');
  const [identity, setIdentity] = useState('');
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

  async function join() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setJoining(true);
    setError('');
    try {
      const invite = parseInvite(link);
      const admission = await joinInvite(invite, identity, controller.signal);
      if (!controller.signal.aborted) setSession({ roomName: invite.room, admission });
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
          onSubmitEditing={join} />
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Action label={joining ? 'Joining…' : 'Join room'} onPress={join}
        disabled={joining || !link.trim() || !identity.trim()} primary />
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
