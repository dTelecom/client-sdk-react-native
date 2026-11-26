import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, StyleSheet, Text, View } from 'react-native';
import { permissions } from '@dtelecom/react-native-webrtc';
import { Camera, CameraType } from 'react-native-camera-kit';
import { readInviteQR } from './invite';
import { scanCameraLifecycle } from './scanCamera';
import { Action, styles } from './ui';

type CloseScanner = (invite?: string, message?: string) => void;

export function InviteScanner({ onClose }: { onClose: CloseScanner }) {
  const [permitted, setPermitted] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);

  const finish: CloseScanner = useCallback((invite, message) => {
    if (!active.current) return;
    active.current = false;
    onClose(invite, message);
  }, [onClose]);

  useEffect(() => {
    active.current = true;
    let mounted = true;
    const camera = scanCameraLifecycle(AppState.currentState, () => setPermitted(true), () => finish());
    const state = AppState.addEventListener('change', camera.onAppState);
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      finish();
      return true;
    });
    async function requestCamera() {
      try {
        const granted = await permissions.request({ name: 'camera' });
        if (!mounted || !active.current) return;
        if (granted) camera.onGrant();
        else finish(undefined, 'Camera access was denied. Paste an invite or enable camera access in Settings.');
      } catch {
        if (mounted) finish(undefined, 'The camera is unavailable. Paste an invite instead.');
      }
    }
    requestCamera();
    return () => {
      mounted = false;
      active.current = false;
      state.remove();
      back.remove();
    };
  }, [finish]);

  function read(value: string) {
    if (!active.current) return;
    try {
      finish(readInviteQR(value));
    } catch {
      setError('This QR code is not a recognized Meet or Live invite. Try another code or cancel to paste an invite.');
    }
  }

  return (
    <View style={[styles.content, styles.screen]}>
      <Text accessibilityRole="header" style={styles.title}>Scan an invite</Text>
      <Text style={styles.detail}>Point the camera at a Meet or Live invite QR code.</Text>
      {permitted && <Camera style={local.preview} cameraType={CameraType.Back} scanBarcode
        allowedBarcodeTypes={['qr']}
        onReadCode={({ nativeEvent }) => read(nativeEvent.codeStringValue)}
        onError={() => finish(undefined, 'The camera is unavailable. Paste an invite instead.')} />}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Action label="Cancel scan" onPress={() => finish()} />
    </View>
  );
}

const local = StyleSheet.create({ preview: { flex: 1, minHeight: 100 } });
