import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/useAuthStore';
import { ROLES } from '../constants/roles';
import { THEME } from '../constants/theme';

import LoginScreen from '../screens/auth/LoginScreen';
import ClientNavigator from './stacks/ClientNavigator';
import OperatorNavigator from './stacks/OperatorNavigator';
import AdminNavigator from './stacks/AdminNavigator';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const role = useAuthStore((state) => state.role);
  const isLoading = useAuthStore((state) => state.isLoading);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingLogoBadge}>
          <Text style={styles.loadingLogoIcon}>🌿</Text>
        </View>
        <ActivityIndicator size="large" color={THEME.colors.primary} style={{ marginTop: 16 }} />
        <Text style={styles.loadingText}>Iniciando EcoRuta Palín...</Text>
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      {!isAuthenticated ? (
        // Flujo de Autenticación
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        // Flujos según el Rol asignado en la BD Supabase (perfiles.rol)
        <>
          {role === ROLES.CLIENTE && (
            <Stack.Screen name="ClientApp" component={ClientNavigator} />
          )}

          {role === ROLES.OPERARIO && (
            <Stack.Screen name="OperatorApp" component={OperatorNavigator} />
          )}

          {role === ROLES.ADMIN && (
            <Stack.Screen name="AdminApp" component={AdminNavigator} />
          )}

          {/* Fallback de seguridad en caso de rol no reconocido */}
          {role !== ROLES.CLIENTE &&
            role !== ROLES.OPERARIO &&
            role !== ROLES.ADMIN && (
              <Stack.Screen name="DefaultClientApp" component={ClientNavigator} />
            )}
        </>
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.background,
    padding: 20,
  },
  loadingLogoBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: THEME.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingLogoIcon: {
    fontSize: 36,
  },
  loadingText: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
    marginTop: 12,
  },
});
