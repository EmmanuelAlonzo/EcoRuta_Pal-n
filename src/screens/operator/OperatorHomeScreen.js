import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useAuthStore } from '../../store/useAuthStore';
import { THEME } from '../../constants/theme';
import { obtenerConteoPendientes } from '../../services/sqlite/database';
import { sincronizarPendientes } from '../../services/syncManager';
import { getRouteClients, PALIN_QUADRANTS } from '../../api/logistics';
import { openExternalNavigation } from '../../utils/navigationLauncher';
import EcoMap from '../../components/common/EcoMap';

export default function OperatorHomeScreen({ navigation }) {
  const profile = useAuthStore((state) => state.profile);
  const logout = useAuthStore((state) => state.logout);

  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Estados para Cabina del Piloto y Cartografía
  const [truckLocation, setTruckLocation] = useState({
    latitude: 14.4042,
    longitude: -90.6978,
  });
  const [routeClients, setRouteClients] = useState([]);
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [hasGps, setHasGps] = useState(false);

  // Cargar conteo de recolecciones offline pendientes
  const loadPendingCount = async () => {
    try {
      const count = await obtenerConteoPendientes();
      setPendingCount(count);
    } catch (error) {
      console.warn('[OperatorHome] Error cargando pendientes:', error);
    }
  };

  // Obtener ubicación GPS actual del camión
  const fetchTruckGps = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setHasGps(true);
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (position?.coords) {
          setTruckLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        }
      } else {
        setHasGps(false);
      }
    } catch (err) {
      console.warn('[OperatorHome] Error obteniendo GPS:', err);
    }
  };

  // Cargar viviendas asignadas a la ruta desde Supabase
  const loadRouteClients = async () => {
    if (!profile?.ruta_asignada) return;
    setIsLoadingClients(true);
    try {
      const clients = await getRouteClients(profile.ruta_asignada);
      setRouteClients(clients);
      if (clients.length > 0 && !selectedDestination) {
        setSelectedDestination(clients[0]);
      }
    } catch (err) {
      console.warn('[OperatorHome] Error cargando viviendas de ruta:', err);
    } finally {
      setIsLoadingClients(false);
    }
  };

  useEffect(() => {
    loadPendingCount();
    fetchTruckGps();
    loadRouteClients();

    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadPendingCount();
      fetchTruckGps();
      loadRouteClients();
    });
    return unsubscribe;
  }, [navigation, profile?.ruta_asignada]);

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

  // Disparar navegación dinámica a Waze / Google Maps
  const handleStartNavigation = () => {
    // Si hay una vivienda seleccionada, usamos sus coordenadas; si no, el primer cliente o centro de cuadrante
    const target = selectedDestination || routeClients[0] || {
      latitud: PALIN_QUADRANTS['Centro Palín'].latitude,
      longitud: PALIN_QUADRANTS['Centro Palín'].longitude,
      nombre_completo: 'Palín Centro',
      direccion: profile?.ruta_asignada || 'Sector Asignado',
    };

    openExternalNavigation({
      latitude: target.latitud,
      longitude: target.longitud,
      label: `${target.nombre_completo || 'Punto de Recolección'} - ${target.direccion || 'Palín'}`,
    });
  };

  // Marcadores combinados para el mapa: Camión actual + Viviendas de la ruta
  const mapMarkers = [
    {
      id: 'truck-current',
      latitude: truckLocation.latitude,
      longitude: truckLocation.longitude,
      title: `🚛 ${profile?.codigo_camion || 'Unidad de Recolección'}`,
      description: `Piloto: ${profile?.nombre_completo || 'Operario'} • Posición actual`,
      type: 'camion',
    },
    ...routeClients.map((client, idx) => ({
      id: client.id || `client-${idx}`,
      latitude: client.latitud,
      longitude: client.longitud,
      title: `🏠 ${client.nombre_completo || 'Vivienda'}`,
      description: `${client.direccion || 'Sector Palín'} • ${client.telefono || 'Sin teléfono'}`,
      type: 'vivienda',
    })),
  ];

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

        {/* 🗺️ CABINA DEL PILOTO: MAPA CARTOGRÁFICO Y RUTEO DINÁMICO */}
        <View style={styles.pilotCabinCard}>
          <View style={styles.pilotCabinHeader}>
            <View>
              <Text style={styles.pilotCabinBadge}>CABINA DEL PILOTO • GPS EN VIVO</Text>
              <Text style={styles.pilotCabinTitle}>Mapa de Ruta y Cuadrantes</Text>
            </View>
            <View style={styles.gpsIndicator}>
              <View style={[styles.gpsDot, hasGps ? styles.gpsDotActive : styles.gpsDotInactive]} />
              <Text style={styles.gpsText}>{hasGps ? 'GPS Fijado' : 'GPS Estimado'}</Text>
            </View>
          </View>

          <Text style={styles.pilotCabinSubtitle}>
            Ubicación en tiempo real de la unidad y {routeClients.length} viviendas georreferenciadas en {profile?.ruta_asignada || 'tu sector'}.
          </Text>

          {/* Componente Universal de Mapa */}
          <EcoMap
            centerCoordinate={truckLocation}
            markers={mapMarkers}
            height={260}
            zoomLevel={15}
            showUserLocation={false}
          />

          {/* Selector de Destino Siguiente */}
          <View style={styles.destinationBox}>
            <View style={{ flex: 1 }}>
              <Text style={styles.destinationLabel}>PRÓXIMO DESTINO / CUADRANTE:</Text>
              <Text style={styles.destinationName} numberOfLines={1}>
                {selectedDestination?.nombre_completo
                  ? `🏠 ${selectedDestination.nombre_completo}`
                  : `📍 ${profile?.ruta_asignada || 'Cuadrante Central de Palín'}`}
              </Text>
              <Text style={styles.destinationAddress} numberOfLines={1}>
                {selectedDestination?.direccion || 'Vía principal hacia siguiente sector'}
              </Text>
            </View>
          </View>

          {/* Carrusel rápido de viviendas de la ruta */}
          {routeClients.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.houseChipsScroll}
            >
              {routeClients.map((client, index) => {
                const isSelected = selectedDestination?.id === client.id;
                return (
                  <TouchableOpacity
                    key={client.id || index}
                    style={[styles.houseChip, isSelected && styles.houseChipActive]}
                    onPress={() => setSelectedDestination(client)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.houseChipIcon, isSelected && styles.houseChipIconActive]}>
                      🏠
                    </Text>
                    <Text
                      style={[styles.houseChipText, isSelected && styles.houseChipTextActive]}
                      numberOfLines={1}
                    >
                      {client.nombre_completo?.split(' ')[0] || `Casa #${index + 1}`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Botón Flotante / Destacado de Ruteo Dinámico */}
          <TouchableOpacity
            style={styles.navActionButton}
            onPress={handleStartNavigation}
            activeOpacity={0.85}
          >
            <View style={styles.navButtonIconCircle}>
              <Text style={styles.navButtonIcon}>🧭</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.navButtonTitle}>Iniciar Ruteo Dinámico</Text>
              <Text style={styles.navButtonSub}>Abrir en Waze o Google Maps con tráfico real</Text>
            </View>
            <Text style={styles.navButtonArrow}>➔</Text>
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
                Apunta la cámara al QR del vecino, valida antifraude y captura pesaje.
              </Text>
            </View>
            <View style={styles.scannerArrowBadge}>
              <Text style={styles.scannerArrowText}>→</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* 3. Tarjeta Informativa de Materiales */}
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
    ...(Platform.OS === 'web' && {
      maxWidth: 1200,
      width: '100%',
      alignSelf: 'center',
    }),
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
  // Cabina del Piloto Card & Map Styles
  pilotCabinCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  pilotCabinHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  pilotCabinBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2563EB',
    letterSpacing: 0.5,
  },
  pilotCabinTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  gpsIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  gpsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  gpsDotActive: {
    backgroundColor: '#10B981',
  },
  gpsDotInactive: {
    backgroundColor: '#F59E0B',
  },
  gpsText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  pilotCabinSubtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginBottom: 12,
    lineHeight: 16,
  },
  destinationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  destinationLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  destinationName: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  destinationAddress: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  houseChipsScroll: {
    paddingVertical: 10,
    gap: 8,
  },
  houseChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  houseChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  houseChipIcon: {
    fontSize: 12,
    marginRight: 5,
  },
  houseChipIconActive: {
    transform: [{ scale: 1.1 }],
  },
  houseChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
    maxWidth: 120,
  },
  houseChipTextActive: {
    color: '#1D4ED8',
    fontWeight: '800',
  },
  navActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  navButtonIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  navButtonIcon: {
    fontSize: 20,
  },
  navButtonTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  navButtonSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  navButtonArrow: {
    fontSize: 18,
    color: '#38BDF8',
    fontWeight: '800',
    marginLeft: 6,
  },
});
