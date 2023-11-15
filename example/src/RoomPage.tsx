import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  Dimensions,
  findNodeHandle,
  Keyboard,
  ListRenderItem,
  NativeModules,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { RootStackParamList } from './App';
import { RoomControls } from './RoomControls';
import { ParticipantView } from './ParticipantView';
import type { TrackPublication } from '@dtelecom/livekit-client';
import {
  DataPacket_Kind,
  Participant,
  RemoteParticipant,
  Room,
  RoomEvent,
} from '@dtelecom/livekit-client';
import { AudioSession, useParticipant, useRoom } from '@livekit/react-native';
// @ts-ignore
import {
  mediaDevices,
  ScreenCapturePickerView,
} from '@livekit/react-native-webrtc';
import { startCallService, stopCallService } from './callservice/CallService';

import 'fastestsmallesttextencoderdecoder';
import { Footer } from './ui/Footer';
import { RoomNavBar } from './ui/RoomNavBar';
import { FlatGrid } from 'react-native-super-grid';
import ActionSheet, { ActionSheetRef } from 'react-native-actions-sheet';
import BaseButton from './ui/BaseButton';
import axios from 'axios';

export const RoomPage = ({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'RoomPage'>) => {
  const [, setIsConnected] = useState(false);
  const [room] = useState(
    () =>
      new Room({
        adaptiveStream: { pixelDensity: 'screen' },
      })
  );
  const { participants } = useRoom(room);
  const { slug, url, token, roomName, isAdmin, cameraEnabled, micEnabled } =
    route.params;
  const [isCameraFrontFacing, setCameraFrontFacing] = useState(true);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<
    Array<{
      message: { message: string; timestamp: number };
      name: string;
      fromMe: boolean;
    }>
  >([]);

  const actionSheetRef = useRef<ActionSheetRef>(null);

  // Perform platform specific call setup.
  useEffect(() => {
    startCallService();
    return () => {
      stopCallService();
    };
  }, [url, token, room]);

  // Connect to room.
  useEffect(() => {
    let connect = async () => {
      // If you wish to configure audio, uncomment the following:
      // await AudioSession.configureAudio({
      //   android: {
      //     preferredOutputList: ["earpiece"],
      //     audioTypeOptions: AndroidAudioTypePresets.communication
      //   },
      //   ios: {
      //     defaultOutput: "earpiece"
      //   }
      // });
      await AudioSession.startAudioSession();
      await room.connect(url, token, {});
      console.log('connected to ', url, ' ', token);
      setIsConnected(true);

      await room.localParticipant.setCameraEnabled(cameraEnabled);
      await room.localParticipant.setMicrophoneEnabled(micEnabled);
    };

    connect();
    return () => {
      if (isAdmin) {
        axios.post('https://dmeet.org/api/deleteRoom', {
          slug,
          identity: room.localParticipant.identity,
        });
      }
      room.disconnect();
      AudioSession.stopAudioSession();
    };
  }, [url, token, room, micEnabled, cameraEnabled, isAdmin, slug]);

  // Setup room listeners
  useEffect(() => {
    const dataReceived = (
      payload: Uint8Array,
      participant?: RemoteParticipant
    ) => {
      //@ts-ignore
      let decoder = new TextDecoder('utf-8');
      let message = decoder.decode(payload);

      setMessages((prevState) => [
        ...prevState,
        {
          name: participant?.name || '',
          message: JSON.parse(message),
          fromMe: participant?.identity === room.localParticipant.identity,
        },
      ]);
      console.log(message);
    };
    room.on(RoomEvent.DataReceived, dataReceived);

    return () => {
      room.off(RoomEvent.DataReceived, dataReceived);
    };
  });

  // Setup views.
  // const stageView = participants.length > 0 && (
  //   <ParticipantView participant={participants[0]} style={styles.stage} />
  // );

  const renderParticipant: ListRenderItem<Participant> = ({ item }) => {
    return (
      <ParticipantView participant={item} style={styles.otherParticipantView} />
    );
  };

  const { cameraPublication, microphonePublication, screenSharePublication } =
    useParticipant(room.localParticipant);

  // Prepare for iOS screenshare.
  const screenCaptureRef = React.useRef(null);
  const screenCapturePickerView = Platform.OS === 'ios' && (
    <ScreenCapturePickerView ref={screenCaptureRef} />
  );
  const startBroadcast = async () => {
    if (Platform.OS === 'ios') {
      const reactTag = findNodeHandle(screenCaptureRef.current);
      await NativeModules.ScreenCapturePickerViewManager.show(reactTag);
      room.localParticipant.setScreenShareEnabled(true);
    } else {
      room.localParticipant.setScreenShareEnabled(true);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <RoomNavBar count={participants.length} roomName={roomName} slug={slug} />

      <FlatGrid
        itemDimension={200}
        data={participants}
        renderItem={renderParticipant}
        spacing={10}
        horizontal={true}
        maxItemsPerRow={2}
      />

      <RoomControls
        micEnabled={isTrackEnabled(microphonePublication)}
        setMicEnabled={(enabled: boolean) => {
          room.localParticipant.setMicrophoneEnabled(enabled);
        }}
        cameraEnabled={isTrackEnabled(cameraPublication)}
        setCameraEnabled={(enabled: boolean) => {
          room.localParticipant.setCameraEnabled(enabled);
        }}
        switchCamera={async () => {
          let facingModeStr = !isCameraFrontFacing ? 'front' : 'environment';
          setCameraFrontFacing(!isCameraFrontFacing);

          let devices = await mediaDevices.enumerateDevices();
          var newDevice;
          //@ts-ignore
          for (const device of devices) {
            //@ts-ignore
            if (
              device.kind === 'videoinput' &&
              device.facing === facingModeStr
            ) {
              newDevice = device;
              break;
            }
          }

          if (newDevice == null) {
            return;
          }

          //@ts-ignore
          await room.switchActiveDevice('videoinput', newDevice.deviceId);
        }}
        screenShareEnabled={isTrackEnabled(screenSharePublication)}
        setScreenShareEnabled={(enabled: boolean) => {
          if (enabled) {
            startBroadcast();
          } else {
            room.localParticipant.setScreenShareEnabled(enabled);
          }
        }}
        sendData={(message: string) => {
          //@ts-ignore
          let encoder = new TextEncoder();
          let encodedData = encoder.encode(message);
          room.localParticipant.publishData(
            encodedData,
            DataPacket_Kind.RELIABLE,
            { topic: 'lk-chat-topic' }
          );
        }}
        onSimulate={(scenario) => {
          room.simulateScenario(scenario);
        }}
        onDisconnectClick={async () => {
          navigation.popToTop();
        }}
        openChat={() => {
          actionSheetRef.current?.show();
        }}
      />

      {screenCapturePickerView}

      <ActionSheet initialSnapIndex={0} snapPoints={[80]} ref={actionSheetRef}>
        <View style={styles.chatContainer}>
          <View style={{ height: '78%' }}>
            <ScrollView
              style={{
                transform: [{ scaleY: -1 }],
                flex: 1,
              }}
              horizontal={false}
            >
              <View style={{ transform: [{ scaleY: -1 }], paddingBottom: 8 }}>
                {messages.map((message, index) => {
                  return (
                    <View key={index} style={styles.message}>
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={styles.messageName}>{message.name}</Text>
                        <Text style={styles.messageTime}>
                          {
                            new Date(message.message.timestamp)
                              .toLocaleTimeString()
                              .split(':')[0]
                          }
                          :
                          {
                            new Date(message.message.timestamp)
                              .toLocaleTimeString()
                              .split(':')[1]
                          }
                        </Text>
                      </View>

                      <View
                        style={{
                          ...styles.messageTextBubble,
                          backgroundColor: message.fromMe
                            ? '#2E3031'
                            : '#324F36',
                        }}
                      >
                        <Text key={index} style={styles.messageText}>
                          {message.message.message}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>

          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              marginBottom: 16,
              paddingHorizontal: 12,
            }}
          >
            <TextInput
              style={styles.chatInput}
              onChangeText={setMessage}
              value={message}
              placeholder="Enter your message"
            />
            <BaseButton
              style={styles.chatButton}
              onPress={() => {
                const msg = {
                  message,
                  timestamp: Date.now(),
                };
                //@ts-ignore
                let encoder = new TextEncoder();
                let encodedData = encoder.encode(JSON.stringify(msg));
                setMessages((prevState) => [
                  ...prevState,
                  {
                    name: room.localParticipant?.name || '',
                    message: msg,
                    fromMe: true,
                  },
                ]);
                room.localParticipant.publishData(
                  encodedData,
                  DataPacket_Kind.RELIABLE,
                  { topic: 'lk-chat-topic' }
                );
                setMessage('');
                Keyboard.dismiss();
              }}
            >
              <Text style={styles.chatButtonText}>Send</Text>
            </BaseButton>
          </View>
        </View>
      </ActionSheet>

      <Footer />
    </SafeAreaView>
  );
};

function isTrackEnabled(pub?: TrackPublication): boolean {
  return !(pub?.isMuted ?? true);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otherParticipantsList: {
    flex: 1,
    gap: 8,
    overflow: 'scroll',
    flexWrap: 'wrap',
  },
  otherParticipantView: {
    flex: 1,
    height: '100%',
    width: Dimensions.get('screen').width - 20,
  },
  chatContainer: {
    height: '100%',
    backgroundColor: '#212121',
    paddingBottom: '20%',
  },
  message: {
    paddingHorizontal: 12,
    maxWidth: '80%',
    gap: 4,
    marginBottom: 16,
  },
  messageName: {
    color: '#777575',
    fontSize: 14,
  },
  messageTime: {
    marginLeft: 'auto',
    color: '#777575',
    fontSize: 14,
  },
  messageTextBubble: {
    backgroundColor: '#324F36',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 5,
    alignSelf: 'flex-start',
  },
  messageText: {
    color: '#fff',
    fontSize: 16,
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
  },
  chatInput: {
    flex: 1,
    height: 42,
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 5,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#777575',
  },
  chatButton: {
    backgroundColor: '#FFFFFF',
    height: 42,
    width: 100,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatButtonText: {
    color: '#000',
  },
});
