import { Platform } from 'react-native';
import { Room } from '@dtelecom/livekit-client';
import type {
  NativeMediaEncryption,
  RoomOptions,
} from '@dtelecom/livekit-client';
import {
  RTCFrameCryptorAlgorithm,
  RTCFrameCryptorFactory,
  RTCFrameCryptorState,
  RTCPeerConnection as NativePeerConnection,
  RTCRtpSender as NativeSender,
  RTCRtpTransceiver as NativeTransceiver,
} from '@dtelecom/react-native-webrtc';
import type {
  RTCFrameCryptor,
  RTCKeyProvider,
} from '@dtelecom/react-native-webrtc';

export interface RoomEncryption extends NativeMediaEncryption {
  /** Use the same string, including base64 padding when present, on each peer. */
  setKey(key: string): Promise<void>;
  /** Release keys after the room's RTP transports have stopped. */
  dispose(): Promise<void>;
}

/** A remote audio receiver rejected a frame. The notification ends on recovery, publication replacement or transport release. */
export class RemoteAudioDecryptionError extends Error {
  constructor(
    readonly track: MediaStreamTrack,
    readonly recovered: Promise<void>
  ) {
    super('Media encryption: FrameCryptorStateDecryptionFailed');
  }
}

type ReceiverBinding = {
  track: MediaStreamTrack;
  publicationId?: string;
  keyId: string;
};

type Endpoint = RTCRtpSender | RTCRtpReceiver;
type Protection = { cryptor: RTCFrameCryptor; dispose(): Promise<void> };
type Attachment = {
  publicationId?: string;
  ready: Promise<Protection>;
  failed: boolean;
};

class NativeRoomEncryption implements RoomEncryption {
  private readonly provider: RTCKeyProvider;
  private readonly transports = new Map<
    RTCPeerConnection,
    Map<Endpoint, Attachment>
  >();
  private readonly transportReleases = new WeakMap<
    RTCPeerConnection,
    Promise<void>
  >();
  private readonly audioKeyRetries = new Set<() => void>();
  private subscriberCount = 0;
  private reportError?: (error: Error) => void;
  private closed = false;
  private released = false;
  private keyUpdates: Promise<void> = Promise.resolve();
  hasKey = false;

  constructor() {
    if (
      !Room.supportsNativeMediaEncryption ||
      typeof NativePeerConnection.prototype.prepareEncryptedReceivers !==
        'function' ||
      typeof NativeTransceiver.prototype.activateEncryptedSender !== 'function'
    ) {
      throw new Error(
        'Encrypted rooms require matching dTelecom room-client and WebRTC packages'
      );
    }
    this.provider = RTCFrameCryptorFactory.createDefaultKeyProvider({
      sharedKey: true,
      ratchetSalt: 'LKFrameEncryptionKey',
      ratchetWindowSize: 8,
      failureTolerance: 0,
      discardFrameWhenCryptorNotReady: true,
    });
  }

  bindRoom(reportError: (error: Error) => void) {
    if (this.closed || this.reportError)
      throw new Error('Use a new encryption controller for each room');
    this.reportError = reportError;
  }

  setKey(key: string): Promise<void> {
    if (this.closed || typeof key !== 'string' || key.length === 0) {
      return Promise.reject(
        new Error('Supply a nonempty key for an active encrypted room')
      );
    }
    return this.updateKeys(async () => {
      if (this.closed) throw new Error('Room encryption was disposed');
      // The native provider derives from the UTF-8 string, as does the browser PBKDF2 provider.
      if (!(await this.provider.setSharedKey(key, 0)))
        throw new Error('Could not install the media key');
      this.hasKey = true;
    });
  }

  private updateKeys(change: () => Promise<void>): Promise<void> {
    const update = this.keyUpdates.then(change);
    this.keyUpdates = update.catch(() => {});
    return update;
  }

  configureSubscriber(pc: RTCPeerConnection) {
    if (this.closed) throw new Error('Room encryption was disposed');
    const native = pc as unknown as NativePeerConnection;
    this.transports.set(pc, new Map());
    const subscriberId = ++this.subscriberCount;
    native.prepareEncryptedReceivers((receiver, publicationId) => {
      const keyId = `receiver/${subscriberId}/${receiver.id}`;
      return this.attach(
        pc,
        receiver as unknown as RTCRtpReceiver,
        () =>
          RTCFrameCryptorFactory.createFrameCryptorForRtpReceiver(
            keyId,
            receiver,
            RTCFrameCryptorAlgorithm.kAesGcm,
            this.provider
          ),
        {
          track: receiver.track as unknown as MediaStreamTrack,
          publicationId,
          keyId,
        }
      );
    });
  }

  attachSender(pc: RTCPeerConnection, sender: RTCRtpSender, identity: string) {
    return this.attach(pc, sender, () =>
      RTCFrameCryptorFactory.createFrameCryptorForRtpSender(
        `sender/${identity}`,
        sender as unknown as NativeSender,
        RTCFrameCryptorAlgorithm.kAesGcm,
        this.provider
      )
    );
  }

  async activateSender(transceiver: RTCRtpTransceiver) {
    if (this.closed) throw new Error('Encrypted transport is closed');
    await (
      transceiver as unknown as NativeTransceiver
    ).activateEncryptedSender();
  }

  async attachReceiver(pc: RTCPeerConnection, receiver: RTCRtpReceiver) {
    const protection = this.transports.get(pc)?.get(receiver);
    if (!protection || this.transportClosed(pc)) {
      throw new Error('Remote encrypted track has no prepared receiver');
    }
    await protection.ready;
    if (
      this.transportClosed(pc) ||
      this.transports.get(pc)?.get(receiver) !== protection
    ) {
      throw new Error('Remote encrypted receiver is no longer active');
    }
  }

  private transportClosed(pc: RTCPeerConnection) {
    return (
      this.closed ||
      pc.signalingState === 'closed' ||
      this.transportReleases.has(pc)
    );
  }

  private async attach(
    pc: RTCPeerConnection,
    endpoint: Endpoint,
    create: () => RTCFrameCryptor,
    receiver?: ReceiverBinding
  ): Promise<void> {
    const isClosed = () => this.transportClosed(pc);
    if (isClosed()) throw new Error('Encrypted transport is closed');
    let attachments = this.transports.get(pc);
    if (!attachments) {
      attachments = new Map();
      this.transports.set(pc, attachments);
    }
    const previous = attachments.get(endpoint);
    const publicationId = receiver?.publicationId;
    if (
      previous &&
      !previous.failed &&
      previous.publicationId === publicationId
    ) {
      await previous.ready;
      return;
    }

    // The bridge holds the receiving m-line inactive until this operation finishes.
    const prepare = async () => {
      if (previous) {
        const protection = await previous.ready.catch(() => undefined);
        await protection?.dispose();
        if (receiver) {
          await this.updateKeys(async () => {
            if (
              !isClosed() &&
              this.hasKey &&
              !(await this.provider.restoreSharedKeyForParticipant(
                receiver.keyId
              ))
            ) {
              throw new Error(
                'Could not restore the media key for the new publication'
              );
            }
          });
        }
      }
      if (isClosed()) throw new Error('Encrypted transport is closed');
      return this.enableCryptor(create(), receiver, isClosed);
    };
    const attachment: Attachment = {
      publicationId,
      ready: prepare(),
      failed: false,
    };
    attachments.set(endpoint, attachment);
    try {
      await attachment.ready;
    } catch (error) {
      attachment.failed = true;
      throw error;
    }
  }

  // M150 invalidates a receiver's key after an authentication failure. The
  // sender can correct its own key without sending a signaling update.
  private retryAudioKey(receiver: ReceiverBinding, isClosed: () => boolean) {
    let delay = 1000;
    let timer: ReturnType<typeof setTimeout>;
    const cancel = () => {
      clearTimeout(timer);
      this.audioKeyRetries.delete(cancel);
    };
    const active = () =>
      this.audioKeyRetries.has(cancel) &&
      !isClosed() &&
      receiver.track.readyState !== 'ended';
    const attempt = async () => {
      try {
        await this.updateKeys(async () => {
          if (
            active() &&
            this.hasKey &&
            receiver.track.enabled &&
            !receiver.track.muted
          ) {
            await this.provider.restoreSharedKeyForParticipant(receiver.keyId);
          }
        });
      } catch {
        // The original failure remains visible until a frame authenticates.
      }
      if (active()) {
        delay = Math.min(2 * delay, 4000);
        timer = setTimeout(attempt, delay);
      } else {
        cancel();
      }
    };
    this.audioKeyRetries.add(cancel);
    timer = setTimeout(attempt, delay);
    return cancel;
  }

  private async enableCryptor(
    cryptor: RTCFrameCryptor,
    receiver: ReceiverBinding | undefined,
    isClosed: () => boolean
  ): Promise<Protection> {
    let failure: RemoteAudioDecryptionError | undefined;
    let resolveFailure: (() => void) | undefined;
    let cancelRetry: (() => void) | undefined;
    const clearFailure = () => {
      cancelRetry?.();
      cancelRetry = undefined;
      resolveFailure?.();
      failure = undefined;
      resolveFailure = undefined;
    };
    const onState = ({ state }: { state: RTCFrameCryptorState }) => {
      if (isClosed()) return;
      if (state === RTCFrameCryptorState.FrameCryptorStateOk) {
        clearFailure();
      } else if (
        receiver?.track.kind === 'audio' &&
        state === RTCFrameCryptorState.FrameCryptorStateDecryptionFailed
      ) {
        if (!failure) {
          const recovered = new Promise<void>((resolve) => {
            resolveFailure = resolve;
          });
          failure = new RemoteAudioDecryptionError(receiver.track, recovered);
          if (Platform.OS === 'android') {
            cancelRetry = this.retryAudioKey(receiver, isClosed);
          }
        }
        this.reportError?.(failure);
      } else if (
        state === RTCFrameCryptorState.FrameCryptorStateDecryptionFailed ||
        state === RTCFrameCryptorState.FrameCryptorStateEncryptionFailed ||
        state === RTCFrameCryptorState.FrameCryptorStateMissingKey ||
        state === RTCFrameCryptorState.FrameCryptorStateInternalError
      ) {
        this.reportError?.(
          new Error(`Media encryption: ${RTCFrameCryptorState[state]}`)
        );
      }
    };
    cryptor.addEventListener('framecryptorstatechanged', onState);
    const dispose = async () => {
      cryptor.removeEventListener('framecryptorstatechanged', onState);
      clearFailure();
      await cryptor.dispose();
    };
    try {
      if (!(await cryptor.setEnabled(true)) || isClosed()) {
        throw new Error(
          'Could not enable media encryption on the RTP endpoint'
        );
      }
    } catch (error) {
      await dispose();
      throw error;
    }
    return { cryptor, dispose };
  }

  releaseTransport(pc: RTCPeerConnection): Promise<void> {
    const releasing = this.transportReleases.get(pc);
    if (releasing) return releasing;
    const attachments = this.transports.get(pc);
    if (!attachments) return Promise.resolve();
    const release = Promise.allSettled(
      Array.from(attachments.values(), async ({ ready }) => {
        const protection = await ready.catch(() => undefined);
        await protection?.dispose();
      })
    )
      .then((results) => {
        for (const result of results) {
          if (result.status === 'rejected') throw result.reason;
        }
      })
      .finally(async () => {
        this.transports.delete(pc);
        await this.releaseProviderIfClosed();
      });
    this.transportReleases.set(pc, release);
    return release;
  }

  async dispose() {
    this.closed = true;
    this.hasKey = false;
    this.reportError = undefined;
    for (const cancel of this.audioKeyRetries) cancel();
    await this.releaseProviderIfClosed();
  }

  private async releaseProviderIfClosed() {
    if (this.closed && !this.released && this.transports.size === 0) {
      this.released = true;
      await this.keyUpdates;
      await this.provider.dispose();
    }
  }
}

/** For apps whose media key arrives separately from the room grant. */
export function createRoomEncryption(): RoomEncryption {
  return new NativeRoomEncryption();
}

/** Create a one-call room with native media encryption required from its first track. */
export async function createEncryptedRoom(
  key: string,
  options?: RoomOptions
): Promise<Room> {
  const encryption = createRoomEncryption();
  try {
    await encryption.setKey(key);
    return new Room({ ...options, nativeEncryption: encryption });
  } catch (error) {
    await encryption.dispose();
    throw error;
  }
}
