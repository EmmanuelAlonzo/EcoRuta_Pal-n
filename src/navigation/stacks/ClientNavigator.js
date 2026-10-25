import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import ClientHomeScreen from '../../screens/client/ClientHomeScreen';
import RewardsScreen from '../../screens/client/RewardsScreen';
import PlaceholderTabScreen from '../../screens/common/PlaceholderTabScreen';
import { THEME } from '../../constants/theme';

const Tab = createBottomTabNavigator();

export default function ClientNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: THEME.roles.cliente,
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
        name="ClientHome"
        component={ClientHomeScreen}
        options={{
          tabBarLabel: 'Inicio',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🌱</Text>,
        }}
      />
      <Tab.Screen
        name="ClientRewards"
        component={RewardsScreen}
        options={{
          tabBarLabel: 'Incentivos',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🎁</Text>,
        }}
      />
      <Tab.Screen
        name="ClientHistory"
        children={() => (
          <PlaceholderTabScreen
            title="Historial de Recolecciones"
            subtitle="Consulta tus entregas de reciclaje y comprobantes de pesaje."
            icon="📋"
          />
        )}
        options={{
          tabBarLabel: 'Historial',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>📋</Text>,
        }}
      />
    </Tab.Navigator>
  );
}
