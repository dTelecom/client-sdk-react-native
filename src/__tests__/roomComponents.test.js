import React from 'react';
import { EventEmitter } from 'events';
import { create, act } from 'react-test-renderer';
import { LiveKitRoom, useRoomContext } from '../components/LiveKitRoom';
import {
  useParticipants,
  useTracks,
  useVisualStableUpdate,
} from '../roomTracks';
import { useDataChannel, DataTopic } from '../useDataChannel';

jest.mock('@dtelecom/livekit-client', () => {
  const events = [
    'Connected',
    'Disconnected',
    'MediaDevicesError',
    'EncryptionError',
    'ConnectionStateChanged',
    'ParticipantConnected',
    'ParticipantDisconnected',
    'Reconnected',
    'TrackPublished',
    'TrackUnpublished',
    'TrackSubscribed',
    'TrackUnsubscribed',
    'LocalTrackPublished',
    'LocalTrackUnpublished',
    'TrackMuted',
    'TrackUnmuted',
    'ActiveSpeakersChanged',
    'ParticipantPermissionsChanged',
    'ParticipantNameChanged',
    'ParticipantMetadataChanged',
    'DataReceived',
  ];
  return {
    RoomEvent: Object.fromEntries(events.map((event) => [event, event])),
    ConnectionState: { Disconnected: 'disconnected' },
    Track: { Source: { Camera: 'camera', ScreenShare: 'screen_share' } },
    DataPacket_Kind: { RELIABLE: 0 },
  };
});

function participant(identity) {
  return {
    identity,
    tracks: new Map(),
    publishData: jest.fn().mockResolvedValue(undefined),
    setMicrophoneEnabled: jest.fn(),
  };
}
function makeRoom() {
  return Object.assign(new EventEmitter(), {
    localParticipant: participant('me'),
    participants: new Map(),
    state: 'disconnected',
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  });
}
const sources = [
  { source: 'camera', withPlaceholder: true },
  { source: 'screen_share', withPlaceholder: false },
];
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('declarative room and shared React hooks', () => {
  it('keeps one join through rerenders, observes late joins/tracks and data, and cleans up on leave', async () => {
    const room = makeRoom();
    const Alice = participant('alice');
    Alice.tracks.set('share', {
      source: 'screen_share',
      trackSid: 'share',
      isSubscribed: true,
    });
    room.participants.set('alice', Alice);
    const callback = jest.fn();
    let result, tree;
    function Nested() {
      result = {
        room: useRoomContext(),
        participants: useParticipants(),
        tracks: useTracks(sources),
        channel: useDataChannel(DataTopic.CHAT, callback),
      };
      return null;
    }
    const view = () => (
      <LiveKitRoom
        room={room}
        audio
        serverUrl="wss://primary.example"
        token="test-grant"
        connectOptions={{
          autoSubscribe: true,
          fallbackUrls: ['wss://alternate.example'],
        }}
        onConnected={() => {}}
      >
        <Nested />
      </LiveKitRoom>
    );
    await act(async () => {
      tree = create(view());
    });
    expect(result.room).toBe(room);
    expect(
      result.tracks.map(
        (ref) => ref.publication?.trackSid ?? ref.participant.identity
      )
    ).toEqual(['me', 'alice', 'share']);
    await act(async () => {
      tree.update(view());
    });
    expect(room.connect).toHaveBeenCalledTimes(1);
    expect(room.connect).toHaveBeenCalledWith(
      'wss://primary.example',
      'test-grant',
      { autoSubscribe: true, fallbackUrls: ['wss://alternate.example'] }
    );
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledTimes(1);
    const Bob = participant('bob');
    const cam = { source: 'camera', trackSid: 'mycam', isSubscribed: true };
    await act(async () => {
      room.participants.set('bob', Bob);
      room.emit('ParticipantConnected', Bob);
      room.localParticipant.tracks.set('cam', cam);
      room.emit('LocalTrackPublished', cam);
    });
    expect(result.tracks[0].publication).toBe(cam);
    expect(result.participants).toEqual([room.localParticipant, Alice, Bob]);
    const payload = Uint8Array.of(1, 2);
    await act(async () => {
      room.emit('DataReceived', payload, Alice, 0, 'other');
      room.emit('DataReceived', payload, Alice, 0, DataTopic.CHAT);
      await result.channel.send(payload);
    });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({
      topic: DataTopic.CHAT,
      from: Alice,
      payload,
    });
    expect(room.localParticipant.publishData).toHaveBeenCalledWith(payload, 0, {
      topic: DataTopic.CHAT,
    });
    await act(async () => {
      tree.unmount();
    });
    expect(room.disconnect).toHaveBeenCalledTimes(1);
    expect(room.eventNames()).toEqual([]);
  });
  it('cancels an in-flight join on a grant change and ignores its late completion', async () => {
    const room = makeRoom();
    let resolveFirst;
    room.connect.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    const report = jest.fn();
    let tree;
    const view = (token) => (
      <LiveKitRoom
        room={room}
        token={token}
        serverUrl="wss://primary.example"
        audio
        onError={report}
      />
    );
    await act(async () => {
      tree = create(view('first'));
    });
    await act(async () => {
      tree.update(view('second'));
    });
    expect(room.connect.mock.calls.map((args) => args[1])).toEqual([
      'first',
      'second',
    ]);
    expect(room.disconnect).toHaveBeenCalledTimes(1);
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveFirst();
    });
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledTimes(1);
    expect(report).not.toHaveBeenCalled();
    await act(async () => {
      tree.unmount();
    });
  });
  it('does not disconnect a caller-owned room when only supplying its context', async () => {
    const room = makeRoom();
    let tree;
    await act(async () => {
      tree = create(<LiveKitRoom room={room} connect={false} />);
    });
    await act(async () => {
      tree.unmount();
    });
    expect(room.connect).not.toHaveBeenCalled();
    expect(room.disconnect).not.toHaveBeenCalled();
  });
  it('retains tiles inside a page while replacing the tile promoted from another page', async () => {
    const refs = ['a', 'b', 'c'].map((id) => ({
      participant: participant(id),
      source: 'camera',
    }));
    let result, tree;
    function Grid({ order }) {
      result = useVisualStableUpdate(order, 2, {
        customSortFunction: (list) => list,
      });
      return null;
    }
    await act(async () => {
      tree = create(<Grid order={refs} />);
    });
    await act(async () => {
      tree.update(<Grid order={[refs[1], refs[0], refs[2]]} />);
    });
    expect(result).toEqual(refs);
    await act(async () => {
      tree.update(<Grid order={[refs[2], refs[1], refs[0]]} />);
    });
    expect(result).toEqual([refs[2], refs[1], refs[0]]);
    await act(async () => {
      tree.unmount();
    });
  });
});
