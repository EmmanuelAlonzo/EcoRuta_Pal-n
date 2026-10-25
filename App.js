import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { supabase } from './src/services/supabase';
import { useAuthStore } from './src/store/useAuthStore';
import { initDatabase } from './src/services/sqlite/database';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);

  useEffect(() => {
    // 1. Inicializar base de datos local SQLite (Offline-First)
    initDatabase().catch((err) => console.warn('[App] Error al inicializar SQLite:', err));

    // 2. Restaurar sesión persistente desde Expo SecureStore al arrancar la app
    initializeAuth();

    // 2. Suscripción a cambios de estado de autenticación (refrescos de token, cierres de sesión)
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        useAuthStore.getState().logout();
      } else if (event === 'TOKEN_REFRESHED' && session) {
        useAuthStore.setState({ session, user: session.user });
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
      <StatusBar style="auto" translucent backgroundColor="transparent" />
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
