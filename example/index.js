import { AppRegistry } from 'react-native';
import { registerGlobals } from '@dtelecom/react-native';
import { name as appName } from './app.json';

registerGlobals();
AppRegistry.registerComponent(appName, () => require('./App').default);
