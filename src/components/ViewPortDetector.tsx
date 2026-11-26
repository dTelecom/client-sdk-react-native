import React, { useEffect, useRef } from 'react';
import { AppState, Dimensions, View } from 'react-native';
import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

type Props = PropsWithChildren<{
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  onChange: (visible: boolean) => void;
}>;

/** Adaptive subscriptions track viewport visibility as a tile scrolls or the app backgrounds. */
export default function ViewPortDetector({
  children,
  disabled,
  style,
  onChange,
}: Props): React.ReactElement {
  const view = useRef<View>(null);
  useEffect(() => {
    if (disabled) return;
    let mounted = true;
    let foreground =
      AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive';
    const measure = () => {
      if (!foreground) return;
      view.current?.measureInWindow((x, y, width, height) => {
        if (!mounted || !foreground) return;
        const window = Dimensions.get('window');
        onChange(
          width > 0 &&
            height > 0 &&
            x < window.width &&
            y < window.height &&
            x + width > 0 &&
            y + height > 0
        );
      });
    };
    const updateVisibility = () => {
      if (foreground) measure();
      else onChange(false);
    };
    const subscription = AppState.addEventListener('change', (state) => {
      foreground = state === 'active';
      updateVisibility();
    });
    updateVisibility();
    const interval = setInterval(measure, 1000);
    return () => {
      mounted = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [disabled, onChange]);
  return (
    <View ref={view} collapsable={false} style={style}>
      {children}
    </View>
  );
}
