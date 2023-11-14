import * as React from 'react';
import { useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { RootStackParamList } from './App';
import { useTheme } from '@react-navigation/native';
import axios from 'axios';
import Logo from './icons/logo.svg';
import { Footer } from './ui/Footer';
import BaseButton from './ui/BaseButton';

import { Camera, useCameraDevice } from 'react-native-vision-camera';

export const JoinPage = ({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'JoinPage'>) => {
  const [name, setName] = useState('');
  const [micEnabled, setMic] = useState(true);
  const [cameraEnabled, setCam] = useState(true);
  var micImage = micEnabled
    ? require('./icons/baseline_mic_white_24dp.png')
    : require('./icons/baseline_mic_off_white_24dp.png');
  var cameraImage = cameraEnabled
    ? require('./icons/baseline_videocam_white_24dp.png')
    : require('./icons/baseline_videocam_off_white_24dp.png');
  const { slug, identity } = route.params;
  const { colors } = useTheme();
  const [roomName, setRoomName] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchRoom() {
      const { data } = await axios.get(
        `https://dmeet.org/api/getRoom?slug=${slug}`
      );
      if (data.roomDeleted) {
        navigation.push('PreJoinPage');
      }
      setRoomName(data.roomName);
    }

    fetchRoom();
  }, [navigation, slug]);

  useEffect(() => {
    const load = async () => {
      const newCameraPermission = Camera.requestCameraPermission();
      const newMicrophonePermission = Camera.requestMicrophonePermission();
    };
    load();
  }, []);

  const onRoomJoin = async () => {
    if (!name || loading) return;
    setLoading(true);
    try {
      const { data } = await axios.post(`https://dmeet.org/api/join`, {
        slug,
        name,
        identity,
      });
      navigation.push('RoomPage', {
        url: data.url,
        token: data.token,
        roomName,
        isAdmin: data.isAdmin,
        cameraEnabled,
        micEnabled,
        slug,
      });
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  const device = useCameraDevice('front');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.logoBox}>
        <Logo />
      </View>

      <View style={styles.content}>
        {device && cameraEnabled && (
          <View style={styles.cameraWrapper}>
            <View style={styles.camera}>
              <Camera
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={true}
              />
            </View>
          </View>
        )}

        <View style={styles.controls}>
          <Pressable
            onPress={() => {
              setCam((prev) => !prev);
            }}
            style={styles.selectorBox}
          >
            <Image style={styles.icon} source={cameraImage} />
            <Text style={styles.text}>Camera</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setMic((prev) => !prev);
            }}
            style={styles.selectorBox}
          >
            <Image style={styles.icon} source={micImage} />
            <Text style={styles.text}>Microphone</Text>
          </Pressable>
        </View>

        <TextInput
          style={{
            color: colors.text,
            borderColor: colors.border,
            ...styles.input,
          }}
          onChangeText={setName}
          value={name}
          placeholder="Enter your name"
        />

        <BaseButton
          onPress={() => {
            onRoomJoin();
          }}
          disabled={!name}
        >
          Join Room
        </BaseButton>
      </View>
      <Footer />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  logoBox: {
    padding: 10,
    alignItems: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    marginBottom: 8,
  },
  input: {
    fontSize: 16,
    borderRadius: 10,
    width: '100%',
    height: 55,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  text: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
  },
  cameraWrapper: {
    width: '100%',
  },
  camera: {
    height: 250,
    width: '100%',
    marginBottom: 16,
    borderRadius: 10,
    overflow: 'hidden',
  },
  selectorBox: {
    flexDirection: 'row',
    height: 49,
    backgroundColor: '#373737',
    flex: 1,
    borderRadius: 10,
    color: '#fff',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  icon: {
    width: 24,
    height: 24,
  },
  controls: {
    width: '100%',
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
});
