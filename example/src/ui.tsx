import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

export const colors = {
  page: '#101922', panel: '#1c2934', text: '#f3f6f6',
  muted: '#b3c3cf', accent: '#93e6ce', error: '#ffb5ab', line: '#3e515e',
};

export function Action({ label, onPress, disabled, primary }: {
  label: string; onPress: () => void; disabled?: boolean; primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button, primary && styles.primary, (pressed || disabled) && styles.dim,
      ]}>
      <Text style={[styles.buttonText, primary && styles.primaryText]}>{label}</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: { padding: 20, gap: 16 },
  field: { gap: 6 },
  title: { color: colors.text, fontSize: 28, fontWeight: '700' },
  section: { color: colors.text, fontSize: 18, fontWeight: '600' },
  label: { color: colors.text, fontSize: 16 },
  detail: { color: colors.muted, fontSize: 14 },
  error: { color: colors.error, fontSize: 15 },
  input: {
    color: colors.text, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line,
    borderRadius: 9, minHeight: 46, paddingHorizontal: 12, fontSize: 16,
  },
  button: { backgroundColor: colors.panel, borderRadius: 9, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  primary: { backgroundColor: colors.accent },
  buttonText: { color: colors.text, fontWeight: '600', fontSize: 15 },
  primaryText: { color: colors.page },
  dim: { opacity: 0.55 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  card: { gap: 6, backgroundColor: colors.panel, borderRadius: 10, padding: 10 },
  video: { width: '100%', aspectRatio: 16 / 9 },
});
