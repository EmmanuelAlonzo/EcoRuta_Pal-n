import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import OperatorHomeScreen from '../../screens/operator/OperatorHomeScreen';
import QRScannerScreen from '../../screens/operator/QRScannerScreen';
import PlaceholderTabScreen from '../../screens/common/PlaceholderTabScreen';
import { THEME } from '../../constants/theme';

const Tab = createBottomTabNavigator();

export default function OperatorNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: THEME.roles.operario,
        tabBarInactiveTintColor: THEME.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: THEME.colors.surface,
          borderTopColor: THEME.colors.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
      }}
    >
      <Tab.Screen
        name="OperatorHome"
        component={OperatorHomeScreen}
        options={{
          tabBarLabel: 'Mi Ruta',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🚛</Text>,
        }}
      />
      <Tab.Screen
        name="OperatorScanner"
        component={QRScannerScreen}
        options={{
          tabBarLabel: 'Escanear QR',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>📷</Text>,
        }}
      />
      <Tab.Screen
        name="OperatorLogs"
        children={() => (
          <PlaceholderTabScreen
            title="Bitácora de Pesaje"
            subtitle="Registro local de recolecciones y cola offline con Expo SQLite."
            icon="⚖️"
          />
        )}
        options={{
          tabBarLabel: 'Pesajes',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>⚖️</Text>,
        }}
      />
    </Tab.Navigator>
  );
}
