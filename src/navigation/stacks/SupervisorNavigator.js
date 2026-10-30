import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import SupervisorHomeScreen from '../../screens/supervisor/SupervisorHomeScreen';
import SupervisorAssignScreen from '../../screens/supervisor/SupervisorAssignScreen';
import { THEME } from '../../constants/theme';

const Tab = createBottomTabNavigator();

export default function SupervisorNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: THEME.roles.supervisor,
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
        name="SupervisorHome"
        component={SupervisorHomeScreen}
        options={{
          tabBarLabel: 'Flota y Rutas',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🚛</Text>,
        }}
      />
      <Tab.Screen
        name="SupervisorAssign"
        component={SupervisorAssignScreen}
        options={{
          tabBarLabel: 'Asignaciones',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>📋</Text>,
        }}
      />
    </Tab.Navigator>
  );
}
