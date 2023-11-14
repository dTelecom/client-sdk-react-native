import * as React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import DtelecomIcon from '../icons/dTelecom.svg';
export const Footer = () => {
  const onClick = () => {
    Linking.openURL('https://dtelecom.org/').catch((err) =>
      console.error("Couldn't load page", err)
    );
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.line} />
      <View onTouchStart={onClick} style={styles.container}>
        <Text style={styles.text}>Powered by</Text>
        <DtelecomIcon />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  line: {
    height: 1,
    backgroundColor: '#2E3031',
  },
  container: {
    paddingTop: 16,
    justifyContent: 'center',
    color: '#fff',
    flexDirection: 'row',
    gap: 8,
  },
  text: {
    color: '#fff',
  },
});
