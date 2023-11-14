import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import React from 'react';

const BaseButton = ({ children, ...props }) => (
  <TouchableOpacity style={styles.button} {...props}>
    <Text style={styles.buttonText}>{children}</Text>
  </TouchableOpacity>
);

export default BaseButton;

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#59e970',
    width: '100%',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
  },
  buttonText: {
    color: 'black',
    fontSize: 20,
    fontWeight: 'bold',
  },
});
