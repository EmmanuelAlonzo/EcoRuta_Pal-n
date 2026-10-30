import React, { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import OperatorHomeScreen from '../../screens/operator/OperatorHomeScreen';
import QRScannerScreen from '../../screens/operator/QRScannerScreen';
import OperatorSetupScreen from '../../screens/operator/OperatorSetupScreen';
import PlaceholderTabScreen from '../../screens/common/PlaceholderTabScreen';
import { THEME } from '../../constants/theme';
import { startSilentSyncListener } from '../../services/syncManager';
import { useAuthStore } from '../../store/useAuthStore';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

/**
 * Navegador de pestañas operativas (Mi Ruta, Escáner QR, Bitácora)
 */
function OperatorTabs() {
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

/**
 * Operador Navigator con Restricción de Flujo:
 * Exige inicializar camión y ruta en OperatorSetupScreen antes de desbloquear el escáner y la ruta.
 */
export default function OperatorNavigator() {
  const profile = useAuthStore((state) => state.profile);

  // El operario tiene el turno habilitado únicamente si confirmó su camión y ruta
  const isShiftReady = Boolean(
    profile?.shiftActive && profile?.codigo_camion && profile?.ruta_asignada
  );

  useEffect(() => {
    // Activa la sincronización silenciosa en segundo plano durante todo el turno del operario
    const unsubscribe = startSilentSyncListener();
    return () => {
      if (typeof unsubscribe === 'function') {
        console.log('🛑 [SilentSync] Desactivando listener de red (fin de turno/logout).');
        unsubscribe();
      }
    };
  }, []);

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'fade',
      }}
    >
      {!isShiftReady ? (
        // Punto de entrada obligatorio: no se puede acceder a las pestañas ni al escáner
        <Stack.Screen name="OperatorSetup" component={OperatorSetupScreen} />
      ) : (
        // Una vez confirmado el turno, se desbloquean las herramientas de campo
        <>
          <Stack.Screen name="OperatorTabs" component={OperatorTabs} />
          <Stack.Screen name="OperatorSetup" component={OperatorSetupScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
