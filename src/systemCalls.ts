import { NativeEventEmitter, NativeModules } from 'react-native';

export type SystemCallAction =
  | 'incoming'
  | 'outgoing'
  | 'answer'
  | 'end'
  | 'remoteEnd'
  | 'mute'
  | 'audioActivated'
  | 'audioDeactivated'
  | 'reset';

export type SystemCallEvent = {
  /** Stable across delivery retries. */
  id: string;
  /** UUID assigned by the host when the invitation was created. */
  callId: string;
  action: SystemCallAction;
  muted?: boolean;
};

interface CallModule {
  currentCallId(): Promise<string | null>;
  pending(): Promise<SystemCallEvent[]>;
  acknowledge(id: string): Promise<void>;
  outgoing(
    id: string,
    displayName: string,
    video: boolean,
    handle: string
  ): Promise<void>;
  connected(id: string): Promise<void>;
  answer(id: string): Promise<void>;
  end(id: string): Promise<void>;
  remoteEnd(id: string): Promise<void>;
  setMuted(id: string, muted: boolean): Promise<void>;
  addListener(name: string): void;
  removeListeners(count: number): void;
}

function native(): CallModule {
  const module: CallModule | undefined = NativeModules.DtelecomSystemCalls;
  if (!module) throw new Error('Install the native dTelecom calling module.');
  return module;
}

let subscribed = false;
let delivery: Promise<void> = Promise.resolve();

export const SystemCalls = {
  /**
   * Install once at application startup. Native actions can predate the JS
   * runtime. Successful handlers are acknowledged in original delivery order.
   */
  listen(
    handle: (event: SystemCallEvent) => void | Promise<void>,
    onError: (error: unknown) => void
  ) {
    if (subscribed)
      throw new Error('A system call listener is already active.');
    const module = native();
    const emitter = new NativeEventEmitter(module);
    let active = true;
    let requested = false;
    let scheduled: Promise<void> | undefined;
    const drain = () => {
      requested = true;
      if (scheduled || !active) return scheduled ?? Promise.resolve();
      // Serialize across listener replacement as well as native notifications.
      // A callback already in progress must acknowledge before the next read.
      scheduled = delivery.then(async () => {
        try {
          while (active && requested) {
            requested = false;
            for (const event of await module.pending()) {
              if (!active) break;
              await handle(event);
              await module.acknowledge(event.id);
            }
          }
        } catch (error) {
          onError(error);
        } finally {
          scheduled = undefined;
        }
      });
      delivery = scheduled.catch(() => {});
      return scheduled;
    };
    const subscription = emitter.addListener(
      'dTelecomCallActionAvailable',
      drain
    );
    subscribed = true;
    drain();
    return {
      retry: drain,
      remove() {
        if (!active) return;
        active = false;
        subscription.remove();
        subscribed = false;
      },
    };
  },
  currentCallId: () => native().currentCallId(),
  outgoing: (
    id: string,
    displayName: string,
    video = false,
    handle = displayName
  ) => native().outgoing(id, displayName, video, handle),
  connected: (id: string) => native().connected(id),
  answer: (id: string) => native().answer(id),
  end: (id: string) => native().end(id),
  reportRemoteEnd: (id: string) => native().remoteEnd(id),
  setMuted: (id: string, muted: boolean) => native().setMuted(id, muted),
};
