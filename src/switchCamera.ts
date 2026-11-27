import { Room, Track } from '@dtelecom/livekit-client';
import { mediaDevices } from '@dtelecom/react-native-webrtc';

export type CameraDevice = { kind: string; deviceId: string; facing?: string };

/** Video inputs reported by the native bridge, including lens facing when available. */
export async function getCameraDevices(): Promise<CameraDevice[]> {
  const devices = (await mediaDevices.enumerateDevices()) as CameraDevice[];
  return devices.filter((device) => device.kind === 'videoinput');
}

/** Switch the published camera and return its new facing for the local preview. */
export async function switchCamera(
  room: Room
): Promise<'user' | 'environment'> {
  const camera = room.localParticipant.getTrack(Track.Source.Camera);
  if (!camera?.videoTrack || camera.isMuted)
    throw new Error('Enable the camera before switching.');
  const settings = camera.videoTrack.mediaStreamTrack.getSettings();
  const devices = await getCameraDevices();
  const current = devices.find((d) => d.deviceId === settings.deviceId);
  const front =
    current?.facing === 'front' ||
    (!current?.facing && settings.facingMode === 'user');
  const facing = front ? 'environment' : 'front';
  const next = devices.find(
    (d) => d.facing === facing && d.deviceId !== settings.deviceId
  );
  if (!next) throw new Error('No opposite-facing camera is available.');
  const changed = await room.switchActiveDevice(
    'videoinput',
    next.deviceId,
    true
  );
  if (!changed) throw new Error('Could not switch the camera.');
  return front ? 'environment' : 'user';
}
