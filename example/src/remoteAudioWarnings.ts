type Publication = { source: string; isMuted: boolean };
type Warning = { track: object; recovered: Promise<void> };
type Pending = { recovered: Promise<void>; attached: boolean; visible: boolean; timer?: ReturnType<typeof setTimeout> };

export function remoteAudioWarnings(
  findPublication: (track: object) => Publication | undefined,
  setVisible: (visible: boolean) => void,
) {
  const pending = new Map<object, Pending>();

  function refresh() {
    let visible = false;
    for (const [track, item] of pending) {
      const publication = findPublication(track);
      if (publication) item.attached = true;
      if (!publication || (publication.source === 'microphone' && publication.isMuted)) {
        clearTimeout(item.timer);
        item.timer = undefined;
        item.visible = false;
        if (!publication && item.attached) pending.delete(track);
        continue;
      }
      if (publication.source !== 'microphone') {
        item.visible = true;
      } else if (!item.visible && item.timer === undefined) {
        item.timer = setTimeout(() => {
          item.timer = undefined;
          item.visible = true;
          refresh(); // Re-read mute and membership after the signaling grace period.
        }, 1000);
      }
      visible ||= item.visible;
    }
    setVisible(visible);
  }

  function add(warning: Warning) {
    const previous = pending.get(warning.track);
    if (previous?.recovered === warning.recovered) return;
    clearTimeout(previous?.timer);
    const item: Pending = { recovered: warning.recovered, attached: false, visible: false };
    pending.set(warning.track, item);
    void warning.recovered.then(() => {
      if (pending.get(warning.track) !== item) return;
      clearTimeout(item.timer);
      pending.delete(warning.track);
      refresh();
    });
    refresh();
  }

  function dispose() {
    for (const item of pending.values()) clearTimeout(item.timer);
    pending.clear();
  }

  function publicationChanged() {
    // The room emits TrackUnsubscribed before it clears the publication's track.
    if (pending.size) {
      void Promise.resolve().then(() => {
        if (pending.size) refresh();
      });
    }
  }

  return { add, publicationChanged, dispose };
}
