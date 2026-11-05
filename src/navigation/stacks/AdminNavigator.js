import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import AdminHomeScreen from '../../screens/admin/AdminHomeScreen';
import AdminFleetMapScreen from '../../screens/admin/AdminFleetMapScreen';
import ManageRedemptionsScreen from '../../screens/admin/ManageRedemptionsScreen';
import AdminPersonnelScreen from '../../screens/admin/AdminPersonnelScreen';
import AdminRolesScreen from '../../screens/admin/AdminRolesScreen';
import SupervisorAssignScreen from '../../screens/supervisor/SupervisorAssignScreen';
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
        name="AdminFleetMap"
        component={AdminFleetMapScreen}
        options={{
          tabBarLabel: 'Radar Flota',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🛰️</Text>,
        }}
      />
      <Tab.Screen
        name="AdminPersonnel"
        component={AdminPersonnelScreen}
        options={{
          tabBarLabel: 'Personal',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>👥</Text>,
        }}
      />
      <Tab.Screen
        name="AdminRoles"
        component={AdminRolesScreen}
        options={{
          tabBarLabel: 'Roles',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🛡️</Text>,
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
        component={SupervisorAssignScreen}
        options={{
          tabBarLabel: 'Cuadrillas',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🗺️</Text>,
        }}
      />
    </Tab.Navigator>
  );
}
