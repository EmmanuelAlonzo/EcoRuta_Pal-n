import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/useAuthStore';
import { THEME } from '../../constants/theme';
import { obtenerConteoPendientes } from '../../services/sqlite/database';
import { sincronizarPendientes } from '../../services/syncManager';

export default function OperatorHomeScreen({ navigation }) {
  const profile = useAuthStore((state) => state.profile);
  const logout = useAuthStore((state) => state.logout);

  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Cargar conteo de recolecciones offline pendientes
  const loadPendingCount = async () => {
    try {
      const count = await obtenerConteoPendientes();
      setPendingCount(count);
    } catch (error) {
      console.warn('[OperatorHome] Error cargando pendientes:', error);
    }
  };

  useEffect(() => {
    loadPendingCount();
    // Actualizar conteo cada vez que la pestaña toma el foco (ej. tras escanear un QR)
    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadPendingCount();
    });
    return unsubscribe;
  }, [navigation]);

  // Ejecutar proceso de sincronización con Supabase
  const handleSync = async () => {
    if (pendingCount === 0) {
      Alert.alert('Al día', 'No tienes recolecciones pendientes por sincronizar.');
      return;
    }

    setIsSyncing(true);
    try {
      const result = await sincronizarPendientes();
      await loadPendingCount();

      if (result.synced > 0) {
        Alert.alert(
          '✅ Sincronización Exitosa',
          `Se enviaron ${result.synced} de ${result.total} recolección(es) a la base de datos de Supabase.`
        );
      } else {
        Alert.alert(
          'Aviso de Sincronización',
          result.message || 'No se pudo subir ningún registro pendiente.'
        );
      }
    } catch (err) {
      console.warn('[OperatorHome] Fallo de sincronización:', err);
      Alert.alert(
        'Sin Conexión a Internet',
        'No fue posible conectar con el servidor. Tus recolecciones siguen almacenadas de forma 100% segura en la memoria de tu dispositivo.'
      );
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Banner Superior con Rol y Logout */}
        <View style={styles.badgeRow}>
          <View style={[styles.roleTag, { backgroundColor: THEME.roles.operario }]}>
            <Text style={styles.roleTagText}>🚛 Rol: Operario de Recolección</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutBtnText}>Cerrar Sesión</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.welcomeText}>Operario: {profile?.nombre_completo || 'Carlos'}</Text>

        {/* Tarjeta de Turno Activo */}
        <View style={styles.shiftCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.shiftCardLabel}>TURNO ASIGNADO (PALÍN)</Text>
            <Text style={styles.shiftCardUnit}>
              🚛 {profile?.codigo_camion || 'Sin camión'}
            </Text>
            <Text style={styles.shiftCardRoute}>
              📍 {profile?.ruta_asignada || 'Sin ruta asignada'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.shiftChangeBtn}
            onPress={() => navigation?.navigate?.('OperatorSetup')}
            activeOpacity={0.8}
          >
            <Text style={styles.shiftChangeBtnText}>Cambiar</Text>
          </TouchableOpacity>
        </View>

        {/* 1. Tarjeta Principal de Sincronización Offline-First */}
        <View style={styles.syncCard}>
          <View style={styles.syncCardHeader}>
            <View>
              <Text style={styles.syncCardLabel}>COLA OFFLINE (SQLITE)</Text>
              <Text style={styles.syncCardTitle}>
                {pendingCount === 0
                  ? 'Todo sincronizado en la nube'
                  : `${pendingCount} recolección(es) pendiente(s)`}
              </Text>
            </View>
            <View
              style={[
                styles.syncBadge,
                pendingCount > 0 ? styles.syncBadgePending : styles.syncBadgeSynced,
              ]}
            >
              <Text style={styles.syncBadgeText}>
                {pendingCount > 0 ? '⏳ Pendiente' : '✓ Al día'}
              </Text>
            </View>
          </View>

          <Text style={styles.syncCardDesc}>
            {pendingCount > 0
              ? 'Tus recolecciones están guardadas en tu teléfono. Al recuperar señal de datos o Wi-Fi, pulsa sincronizar.'
              : 'Todas las recolecciones locales ya están registradas en la base de datos de Supabase.'}
          </Text>

          <TouchableOpacity
            style={[
              styles.syncButton,
              pendingCount === 0 && styles.syncButtonDisabled,
            ]}
            onPress={handleSync}
            disabled={isSyncing || pendingCount === 0}
            activeOpacity={0.8}
          >
            {isSyncing ? (
              <View style={styles.syncButtonLoading}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.syncButtonText}> Sincronizando con Supabase...</Text>
              </View>
            ) : (
              <Text style={styles.syncButtonText}>
                🔄 {pendingCount > 0 ? 'Sincronizar Ahora' : 'Sin pendientes'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* 2. Acceso Directo al Escáner QR */}
        <TouchableOpacity
          style={[styles.actionCard, styles.scannerHighlightCard]}
          onPress={() => navigation.navigate('OperatorScanner')}
          activeOpacity={0.8}
        >
          <View style={styles.scannerCardRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.scannerHighlightTitle}>📷 Iniciar Escaneo QR</Text>
              <Text style={styles.scannerHighlightDesc}>
                Apunta la cámara al QR del vecino, captura GPS y guarda el pesaje en SQLite.
              </Text>
            </View>
            <View style={styles.scannerArrowBadge}>
              <Text style={styles.scannerArrowText}>→</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* 3. Tarjeta Informativa de Ruta */}
        <View style={styles.actionCard}>
          <Text style={styles.actionTitle}>🗺️ Ruta Asignada</Text>
          <Text style={styles.actionDesc}>
            Palín Zona 1 y Zona 2 (Barrio San Pedro, El Calvario y San José).
          </Text>
        </View>

        <View style={styles.actionCard}>
          <Text style={styles.actionTitle}>⚖️ Materiales Admitidos</Text>
          <Text style={styles.actionDesc}>
            Plástico PET (15 pts/kg), Cartón (10 pts/kg), Aluminio (25 pts/kg) y Vidrio (8 pts/kg).
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  content: {
    padding: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  roleTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  roleTagText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  logoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
  },
  logoutBtnText: {
    color: THEME.colors.danger,
    fontWeight: '600',
    fontSize: 12,
  },
  welcomeText: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  camionText: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 4,
    marginBottom: 16,
  },
  syncCard: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
  },
  syncCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  syncCardLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.5,
  },
  syncCardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  syncBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  syncBadgePending: {
    backgroundColor: '#F59E0B',
  },
  syncBadgeSynced: {
    backgroundColor: '#10B981',
  },
  syncBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  syncCardDesc: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 18,
    marginBottom: 14,
  },
  syncButton: {
    backgroundColor: THEME.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncButtonDisabled: {
    backgroundColor: '#334155',
    opacity: 0.8,
  },
  syncButtonLoading: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  actionCard: {
    backgroundColor: THEME.colors.surface,
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  scannerHighlightCard: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
    borderWidth: 1.5,
  },
  scannerCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scannerHighlightTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1D4ED8',
    marginBottom: 4,
  },
  scannerHighlightDesc: {
    fontSize: 13,
    color: '#3B82F6',
    lineHeight: 18,
  },
  scannerArrowBadge: {
    backgroundColor: '#DBEAFE',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  scannerArrowText: {
    color: '#1D4ED8',
    fontSize: 16,
    fontWeight: '800',
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 4,
  },
  actionDesc: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  shiftCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#F0F7FF',
  },
  shiftCardLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2563EB',
    letterSpacing: 0.5,
  },
  shiftCardUnit: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  shiftCardRoute: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
    marginTop: 1,
  },
  shiftChangeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#DBEAFE',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  shiftChangeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
});
