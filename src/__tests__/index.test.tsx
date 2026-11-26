import type { Room } from '@dtelecom/livekit-client';
import { mediaDevices } from '@dtelecom/react-native-webrtc';
import { connectRoom } from '../connectRoom';
import { switchCamera } from '../switchCamera';

jest.mock('@dtelecom/react-native-webrtc', () => ({
  mediaDevices: { enumerateDevices: jest.fn() },
}));
jest.mock('@dtelecom/livekit-client', () => ({
  Track: { Source: { Camera: 'camera' } },
}));

describe('mobile room entry points', () => {
  it('forwards the primary, issuer alternatives and one grant to the shared room client', async () => {
    const room = { connect: jest.fn().mockResolvedValue(undefined) };
    const alternatives = ['wss://node-b.example', 'wss://node-c.example'];
    await connectRoom(
      room as unknown as Room,
      {
        wsUrl: 'wss://node-a.example',
        token: 'grant',
        fallbackUrls: alternatives,
      },
      { autoSubscribe: false }
    );
    expect(room.connect).toHaveBeenCalledWith('wss://node-a.example', 'grant', {
      fallbackUrls: alternatives,
      autoSubscribe: false,
    });
    await connectRoom(room as unknown as Room, {
      wsUrl: 'wss://single.example',
      token: 'other',
    });
    expect(room.connect).toHaveBeenLastCalledWith(
      'wss://single.example',
      'other',
      { fallbackUrls: undefined }
    );
  });

  const front = { kind: 'videoinput', deviceId: 'front', facing: 'front' };
  const back = { kind: 'videoinput', deviceId: 'back', facing: 'environment' };
  function publishing() {
    return {
      localParticipant: {
        getTrack: jest.fn().mockReturnValue({
          isMuted: false,
          videoTrack: {
            mediaStreamTrack: { getSettings: () => ({ deviceId: 'front' }) },
          },
        }),
      },
      switchActiveDevice: jest.fn().mockResolvedValue(true),
    };
  }

  it('selects the opposite-facing video device and reports the new facing after a successful switch', async () => {
    const room = publishing();
    (mediaDevices.enumerateDevices as jest.Mock).mockResolvedValue([
      front,
      back,
    ]);
    await expect(switchCamera(room as unknown as Room)).resolves.toBe(
      'environment'
    );
    expect(room.switchActiveDevice).toHaveBeenCalledWith(
      'videoinput',
      'back',
      true
    );
    room.switchActiveDevice.mockResolvedValue(false);
    await expect(switchCamera(room as unknown as Room)).rejects.toThrow(
      'Could not switch'
    );
  });
  it('leaves the current lens in place on single-camera devices', async () => {
    const room = publishing();
    (mediaDevices.enumerateDevices as jest.Mock).mockResolvedValue([front]);
    await expect(switchCamera(room as unknown as Room)).rejects.toThrow(
      'No opposite-facing'
    );
    expect(room.switchActiveDevice).not.toHaveBeenCalled();
  });
});
