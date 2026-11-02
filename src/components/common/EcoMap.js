import EcoMapNative from './EcoMap.native';
import EcoMapWeb from './EcoMap.web';
import { Platform } from 'react-native';

const EcoMap = Platform.OS === 'web' ? EcoMapWeb : EcoMapNative;

export default EcoMap;
