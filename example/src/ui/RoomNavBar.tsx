import React, { useState } from 'react';
// import { ChainIcon, TickIcon } from '@/assets';
import BaseButton from './BaseButton';
import {
  Alert,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import LogoSmall from '../icons/logoSmall.svg';
import TickIcon from '../icons/tick.svg';
import ChainIcon from '../icons/chain.svg';
import ParticipantsIcon from '../icons/participants.svg';

interface RoomNavBarProps {
  slug: string;
  roomName: string;
  iconFull?: boolean;
  count: number;
}

export const RoomNavBar = ({ slug, roomName, count }: RoomNavBarProps) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const url = encodeURI(
      `https://dmeet.org/join/${slug}?roomName=${roomName}`
    );
    Clipboard.setString(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const onShare = async () => {
    const url = encodeURI(
      `https://dmeet.org/join/${slug}?roomName=${roomName}`
    );
    try {
      const result = await Share.share({
        message: url,
      });
      if (result.action === Share.sharedAction) {
        if (result.activityType) {
          // shared with activity type of result.activityType
        } else {
          // shared
        }
      } else if (result.action === Share.dismissedAction) {
        // dismissed
      }
    } catch (error: any) {
      Alert.alert(error.message);
    }
  };
  return (
    <View>
      <View style={styles.container}>
        <LogoSmall style={styles.logo} />
        {/*<ParticipantsBadge count={count} />*/}
        <Text style={styles.title}>{roomName}</Text>
        <View style={styles.right}>
          <View style={styles.participants}>
            <ParticipantsIcon />
            <Text style={styles.text}>{count}</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              copy();
            }}
            style={styles.btn}
          >
            {copied ? <TickIcon /> : <ChainIcon />}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    flexDirection: 'row',
    width: '100%',
    padding: 8,
  },
  logo: { marginRight: 'auto' },
  title: {
    fontSize: 16,
    color: '#fff',
  },
  right: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 'auto',
  },
  btn: {
    borderRadius: 10,
    backgroundColor: '#59E970',
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  participants: {
    flexDirection: 'row',
    height: 32,
    gap: 4,
    backgroundColor: '#2E3031',
    borderRadius: 10,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#fff',
  },
});
