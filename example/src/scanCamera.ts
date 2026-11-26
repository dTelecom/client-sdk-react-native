// Android may background the app while its system camera-permission dialog is open.
export function scanCameraLifecycle(initialState: string | null, start: () => void, close: () => void) {
  let appState = initialState;
  let granted = false;
  let started = false;

  function startWhenReady() {
    if (granted && !started && appState === 'active') {
      started = true;
      start();
    }
  }

  return {
    onGrant() {
      granted = true;
      startWhenReady();
    },
    onAppState(next: string) {
      appState = next;
      if (started && next === 'background') close();
      else startWhenReady();
    },
  };
}
