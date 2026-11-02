import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AffiliateHomeScreen from '../../screens/affiliate/AffiliateHomeScreen';

const Stack = createNativeStackNavigator();

/**
 * Navegador Principal para el Rol 'Afiliado' (Comercios Aliados de Palín)
 */
export default function AffiliateNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'fade',
      }}
    >
      <Stack.Screen name="AffiliateHome" component={AffiliateHomeScreen} />
    </Stack.Navigator>
  );
}
