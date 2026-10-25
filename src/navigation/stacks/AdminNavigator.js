import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import AdminHomeScreen from '../../screens/admin/AdminHomeScreen';
import ManageRedemptionsScreen from '../../screens/admin/ManageRedemptionsScreen';
import PlaceholderTabScreen from '../../screens/common/PlaceholderTabScreen';
import { THEME } from '../../constants/theme';

const Tab = createBottomTabNavigator();

export default function AdminNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: THEME.roles.admin,
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
        name="AdminHome"
        component={AdminHomeScreen}
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>📊</Text>,
        }}
      />
      <Tab.Screen
        name="AdminRewards"
        component={ManageRedemptionsScreen}
        options={{
          tabBarLabel: 'Canjes',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🎁</Text>,
        }}
      />
      <Tab.Screen
        name="AdminRoutes"
        children={() => (
          <PlaceholderTabScreen
            title="Gestión de Rutas"
            subtitle="Creación, asignación y monitoreo de las rutas de recolección en Palín."
            icon="🗺️"
          />
        )}
        options={{
          tabBarLabel: 'Rutas',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🗺️</Text>,
        }}
      />
    </Tab.Navigator>
  );
}
