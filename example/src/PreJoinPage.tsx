import * as React from 'react';
import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  StyleSheet,
  View,
  TextInput,
  Text,
  SafeAreaView,
  Linking,
} from 'react-native';
import type { RootStackParamList } from './App';
import { useTheme } from '@react-navigation/native';
import axios from 'axios';
import Logo from './icons/logo.svg';
import { Footer } from './ui/Footer';
import BaseButton from './ui/BaseButton';

export const PreJoinPage = ({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'PreJoinPage'>) => {
  const [roomName, setRoomName] = useState('');
  const [loading, setLoading] = useState(false);

  const { colors } = useTheme();

  const onRoomCreate = async () => {
    if (loading) {
      return;
    }
    setLoading(true);
    try {
      const { data } = await axios
        .post<{ identity: string; slug: string }>(
          'https://dmeet.org/api/createRoom',
          { roomName }
        )
        .catch((err) => {
          console.log(err);
          return err;
        });
      setRoomName('');
      navigation.push('JoinPage', { slug: data.slug, identity: data.identity });
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.logoBox}>
        <Logo />
      </View>

      <View style={styles.content}>
        <Text style={{ ...styles.title, color: colors.text }}>
          Create a Web3 Meeting
        </Text>
        <Text style={styles.text}>
          Open source video conferencing app built on{'\n'}
          <Text
            onPress={() =>
              Linking.openURL('https://video.dtelecom.org').catch((err) =>
                console.error("Couldn't load page", err)
              )
            }
            style={{ ...styles.text, color: '#59e970' }}
          >
            dTelecom Cloud
          </Text>
        </Text>
        <TextInput
          style={{
            color: colors.text,
            borderColor: colors.border,
            ...styles.input,
          }}
          onChangeText={setRoomName}
          value={roomName}
          placeholder="Enter a room name"
        />

        <BaseButton
          onPress={() => {
            onRoomCreate();
          }}
          disabled={!roomName}
        >
          Create a Room
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
    marginTop: 24,
    borderRadius: 10,
    width: '100%',
    height: 55,
    padding: 12,
    margin: 12,
    borderWidth: 1,
  },
  text: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
  },
});
