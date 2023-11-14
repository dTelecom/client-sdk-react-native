import * as React from 'react';

import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PreJoinPage } from './PreJoinPage';
import { RoomPage } from './RoomPage';
import Toast from 'react-native-toast-message';
import { JoinPage } from './JoinPage';

const Stack = createNativeStackNavigator();

const linking = {
  // Prefixes accepted by the navigation container, should match the added schemes
  prefixes: ['dmeet://'],
  // Route config to map uri paths to screens
  config: {
    // Initial route name to be added to the stack before any further navigation,
    // should match one of the available screens
    initialRouteName: 'PreJoinPage' as const,
    screens: {
      // myapp://home -> HomeScreen
      PreJoinPage: '/',
      // myapp://details/1 -> DetailsScreen with param id: 1
      JoinPage: 'join/:slug',
    },
  },
};
export default function App() {
  return (
    <>
      <NavigationContainer linking={linking} theme={DarkTheme}>
        <Stack.Navigator>
          <Stack.Screen
            name="PreJoinPage"
            component={PreJoinPage}
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="JoinPage"
            component={JoinPage}
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="RoomPage"
            component={RoomPage}
            options={{
              headerShown: false,
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
      <Toast />
    </>
  );
}

export type RootStackParamList = {
  PreJoinPage: undefined;
  JoinPage: { slug: string; identity?: string };
  RoomPage: {
    url: string;
    token: string;
    roomName: string;
    isAdmin: boolean;
    cameraEnabled: boolean;
    micEnabled: boolean;
    slug: string;
  };
};
