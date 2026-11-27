import { SystemCalls } from '../systemCalls';
import type { SystemCallEvent } from '../systemCalls';

const mockPending = jest.fn();
const mockAcknowledge = jest.fn();
const mockSubscribe = jest.fn();
jest.mock('react-native', () => ({
  NativeModules: {
    get DtelecomSystemCalls() {
      return { pending: mockPending, acknowledge: mockAcknowledge };
    },
  },
  NativeEventEmitter: class {
    addListener(name: string, callback: () => void) {
      return mockSubscribe(name, callback);
    }
  },
}));

const answered: SystemCallEvent = { id: '1', callId: 'a', action: 'answer' };
const ended: SystemCallEvent = { id: '2', callId: 'a', action: 'remoteEnd' };
const flush = () => new Promise<void>((done) => setImmediate(done));

beforeEach(() => {
  jest.resetAllMocks();
  mockSubscribe.mockReturnValue({ remove: jest.fn() });
});

it('drains cold actions in order and rechecks a notification during the first read', async () => {
  const events: string[] = [];
  let wake!: () => void;
  mockSubscribe.mockImplementation((_name, callback) => {
    wake = callback;
    return { remove: jest.fn() };
  });
  mockPending
    .mockImplementationOnce(async () => {
      wake();
      return [answered];
    })
    .mockResolvedValueOnce([ended]);
  const subscription = SystemCalls.listen(async (event) => {
    events.push(event.action);
  }, jest.fn());
  await flush();
  expect(events).toEqual(['answer', 'remoteEnd']);
  expect(mockAcknowledge.mock.calls).toEqual([['1'], ['2']]);
  subscription.remove();
});

it('leaves a failed action pending for an explicit retry', async () => {
  mockPending.mockResolvedValue([answered]);
  const handle = jest
    .fn()
    .mockRejectedValueOnce(new Error('user store warming up'));
  const onError = jest.fn();
  const subscription = SystemCalls.listen(handle, onError);
  await flush();
  expect(onError).toHaveBeenCalledTimes(1);
  expect(mockAcknowledge).not.toHaveBeenCalled();
  await subscription.retry();
  expect(mockAcknowledge).toHaveBeenCalledWith('1');
  subscription.remove();
});

it('can replace the listener while an earlier handler is acknowledging', async () => {
  const events = [answered, ended];
  mockPending.mockImplementation(async () => [...events]);
  mockAcknowledge.mockImplementation(async (id) => {
    expect(events.shift()?.id).toBe(id);
  });
  let finish!: () => void;
  const previous = SystemCalls.listen(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    jest.fn()
  );
  await flush();
  previous.remove();
  const next = jest.fn();
  const current = SystemCalls.listen(next, jest.fn());
  finish();
  await flush();
  expect(next).toHaveBeenCalledTimes(1);
  expect(next).toHaveBeenCalledWith(ended);
  expect(events).toHaveLength(0);
  current.remove();
});
