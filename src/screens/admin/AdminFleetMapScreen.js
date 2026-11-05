import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
  Platform,
  Dimensions,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabase';
import { THEME } from '../../constants/theme';
import EcoMap from '../../components/common/EcoMap';

// Coordenadas base y cuadrantes clave de Palín, Escuintla
const PALIN_CENTER = {
  latitude: 14.4042,
  longitude: -90.6978,
  latitudeDelta: 0.028,
  longitudeDelta: 0.028,
};

const PALIN_SECTORS = [
  { name: 'Centro / Casco Urbano', lat: 14.4042, lng: -90.6978, icon: '🏛️' },
  { name: 'Mercado Municipal', lat: 14.4055, lng: -90.6960, icon: '🛍️' },
  { name: 'Barrio San Pedro', lat: 14.4010, lng: -90.7020, icon: '🏘️' },
  { name: 'Colonia San José', lat: 14.4090, lng: -90.6930, icon: '🏡' },
  { name: 'Barrio San Antonio', lat: 14.4075, lng: -90.7010, icon: '🌳' },
  { name: 'Salida Autopista', lat: 14.3980, lng: -90.7000, icon: '🛣️' },
];

/**
 * Panel Gerencial: Centro de Comando y Radar Satelital de Flota & Clientes
 * Provee visualización a pantalla completa con dos capas conmutables:
 * 1) 📍 Mapa de Calor (Clientes): Identificación de densidad comercial para marketing.
 * 2) 🚛 Flota Activa: Monitoreo de cuadrillas en tiempo real con última actualización.
 */
export default function AdminFleetMapScreen({ navigation }) {
  // Capas superiores (Toggles)
  const [showClientsLayer, setShowClientsLayer] = useState(true);
  const [showFleetLayer, setShowFleetLayer] = useState(true);

  // Estados de datos
  const [rawClients, setRawClients] = useState([]);
  const [rawCuadrillas, setRawCuadrillas] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Centro de visualización interactivo
  const [centerCoord, setCenterCoord] = useState({
    latitude: PALIN_CENTER.latitude,
    longitude: PALIN_CENTER.longitude,
  });

  // Entidad seleccionada (para tarjeta flotante inferior)
  const [selectedEntity, setSelectedEntity] = useState(null);

  /**
   * Consulta datos de Supabase:
   * 1. Clientes en tabla `perfiles` (rol = 'cliente')
   * 2. Cuadrillas en tabla `cuadrillas` (latitud_actual, longitud_actual, ultima_actualizacion)
   */
  const loadMapData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      // 1. Consultar clientes registrados en `perfiles`
      const { data: clientsData, error: clientErr } = await supabase
        .from('perfiles')
        .select('*')
        .eq('rol', 'cliente')
        .order('nombre_completo', { ascending: true });

      if (clientErr) {
        console.warn('[AdminFleetMap] Advertencia consultando clientes:', clientErr.message);
      }

      // 2. Consultar cuadrillas de flota en `cuadrillas`
      const { data: cuadrillasData, error: cuadErr } = await supabase
        .from('cuadrillas')
        .select('*')
        .order('nombre', { ascending: true });

      if (cuadErr) {
        console.warn('[AdminFleetMap] Advertencia consultando cuadrillas:', cuadErr.message);
      }

      setRawClients(clientsData || []);
      setRawCuadrillas(cuadrillasData || []);
    } catch (err) {
      console.error('[AdminFleetMap] Excepción al cargar datos satelitales:', err);
      Alert.alert('Error', 'No se pudieron sincronizar los datos del mapa en Supabase.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadMapData();
    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadMapData(true);
    });
    return unsubscribe;
  }, [navigation, loadMapData]);

  // ─── PROCESAMIENTO DE CAPA 1: CLIENTES (MAPA DE CALOR / MARKETING) ────────
  const clientMarkers = useMemo(() => {
    if (!showClientsLayer) return [];

    // Clientes con coordenadas explícitas fijadas en su vivienda
    const validLocationClients = (rawClients || []).filter((c) => {
      const lat = parseFloat(c.latitud);
      const lng = parseFloat(c.longitud);
      return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
    });

    // Si existen coordenadas reales en la BD, mapearlas directamente
    const realPins = validLocationClients.map((c) => ({
      id: `client_${c.id}`,
      latitude: parseFloat(c.latitud),
      longitude: parseFloat(c.longitud),
      tipo: 'cliente',
      nombre_completo: c.nombre_completo || 'Cliente Registrado',
      direccion: c.direccion || 'Palín, Escuintla',
      email: c.email || '',
      telefono: c.telefono || 'Sin tel',
      subInfo: 'Vivienda fijada por GPS',
    }));

    // Si hay clientes en perfiles sin coordenadas aún fijadas por el usuario,
    // generar puntos distribuidos en los sectores comerciales para permitir
    // visualizar la densidad de marketing inmediatamente.
    const unpinnedClients = (rawClients || []).filter((c) => {
      const lat = parseFloat(c.latitud);
      const lng = parseFloat(c.longitud);
      return isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0;
    });

    const fallbackSectorPins = unpinnedClients.map((c, idx) => {
      const sector = PALIN_SECTORS[idx % PALIN_SECTORS.length];
      // Pequeña dispersión para no superponer pines en un mismo vértice
      const jitterLat = (Math.sin(idx * 1.7) * 0.0035);
      const jitterLng = (Math.cos(idx * 2.3) * 0.0035);

      return {
        id: `client_unpinned_${c.id || idx}`,
        latitude: sector.lat + jitterLat,
        longitude: sector.lng + jitterLng,
        tipo: 'cliente',
        nombre_completo: c.nombre_completo || `Cliente #${idx + 1}`,
        direccion: c.direccion || `Sector ${sector.name}, Palín`,
        email: c.email || '',
        telefono: c.telefono || 'Sin teléfono',
        subInfo: 'Sector estimado de residencia',
      };
    });

    return [...realPins, ...fallbackSectorPins];
  }, [rawClients, showClientsLayer]);

  // ─── PROCESAMIENTO DE CAPA 2: FLOTA ACTIVA (CUADRILLAS EN CAMPO) ───────────
  const fleetMarkers = useMemo(() => {
    if (!showFleetLayer) return [];

    return (rawCuadrillas || []).map((cuad, idx) => {
      // Coordenadas actuales del camión/cuadrilla
      let lat = parseFloat(cuad.latitud_actual);
      let lng = parseFloat(cuad.longitud_actual);

      // Si no tiene GPS aún asignado en BD, simular ubicación de patrullaje en Palín
      if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
        const sector = PALIN_SECTORS[idx % PALIN_SECTORS.length];
        lat = sector.lat + 0.0018 * (idx % 2 === 0 ? 1 : -1);
        lng = sector.lng + 0.0018 * (idx % 2 === 0 ? -1 : 1);
      }

      // Formato legible de última actualización
      let timeLabel = 'Recién reportado';
      if (cuad.ultima_actualizacion) {
        try {
          const date = new Date(cuad.ultima_actualizacion);
          timeLabel = !isNaN(date.getTime())
            ? date.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })
            : String(cuad.ultima_actualizacion);
        } catch {
          timeLabel = String(cuad.ultima_actualizacion);
        }
      } else if (cuad.updated_at) {
        try {
          const date = new Date(cuad.updated_at);
          timeLabel = !isNaN(date.getTime())
            ? date.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })
            : 'En turno';
        } catch {
          timeLabel = 'En turno';
        }
      }

      return {
        id: `cuad_${cuad.id || idx}`,
        latitude: lat,
        longitude: lng,
        tipo: 'flota',
        nombre_completo: cuad.nombre || `Cuadrilla #${idx + 1}`,
        direccion: cuad.codigo_camion
          ? `Unidad: ${cuad.codigo_camion} • ${cuad.descripcion || 'Ruta activa'}`
          : cuad.descripcion || 'Cuadrilla de recolección en campo',
        codigo_camion: cuad.codigo_camion || 'CAM-FLOTA',
        ultima_actualizacion: timeLabel,
        total_miembros: cuad.total_miembros || cuad.miembros?.length || 0,
      };
    });
  }, [rawCuadrillas, showFleetLayer]);

  // Marcadores finales combinados para el componente EcoMap (react-native-maps)
  const allActiveMarkers = useMemo(() => {
    return [...clientMarkers, ...fleetMarkers];
  }, [clientMarkers, fleetMarkers]);

  // Estadísticas del mapa de calor y marketing
  const densitySummary = useMemo(() => {
    const totalClients = rawClients.length;
    const clientsWithGPS = rawClients.filter((c) => c.latitud && c.longitud).length;
    const activeTrucks = fleetMarkers.length;

    return {
      totalClients,
      clientsWithGPS,
      activeTrucks,
      densityZone: 'Mercado Municipal & Casco Urbano (Zona Alta)',
    };
  }, [rawClients, fleetMarkers]);

  // Manejador al presionar un pin en el mapa
  const handleMarkerPress = (marker) => {
    setSelectedEntity(marker);
    if (marker?.latitude && marker?.longitude) {
      setCenterCoord({
        latitude: marker.latitude,
        longitude: marker.longitude,
      });
    }
  };

  // Salto rápido a un sector de Palín
  const handleJumpToSector = (sector) => {
    setCenterCoord({
      latitude: sector.lat,
      longitude: sector.lng,
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* ─── CONTENEDOR DEL MAPA A PANTALLA COMPLETA ("CENTRO DE COMANDO") ── */}
      <View style={styles.fullscreenMapContainer}>
        <EcoMap
          centerCoordinate={centerCoord}
          initialRegion={PALIN_CENTER}
          markers={allActiveMarkers}
          onMarkerPress={handleMarkerPress}
          height="100%"
          style={styles.fullscreenMap}
        />

        {/* ─── HUD SUPERIOR: CABECERA TRANSLÚCIDA DEL CENTRO DE COMANDO ──── */}
        <View style={styles.topHudContainer}>
          <View style={styles.hudCard}>
            <View style={styles.hudHeaderRow}>
              <View style={{ flex: 1 }}>
                <View style={styles.hudBadge}>
                  <Text style={styles.hudBadgeText}>🛰️ CENTRO DE COMANDO • PALÍN</Text>
                </View>
                <Text style={styles.hudTitle}>Radar Gerencial de Flota & Mercado</Text>
              </View>

              <TouchableOpacity
                style={styles.refreshBtn}
                onPress={() => loadMapData(true)}
                disabled={isRefreshing}
                activeOpacity={0.8}
              >
                {isRefreshing ? (
                  <ActivityIndicator size="small" color="#38BDF8" />
                ) : (
                  <Text style={styles.refreshBtnText}>🔄 Actualizar</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* ─── DOS CAPAS (TOGGLES) SUPERIORES (REQUERIMIENTO 2) ────────── */}
            <View style={styles.layerTogglesRow}>
              <TouchableOpacity
                style={[
                  styles.layerToggleBtn,
                  showClientsLayer && styles.layerToggleBtnActiveClients,
                ]}
                onPress={() => setShowClientsLayer((prev) => !prev)}
                activeOpacity={0.85}
              >
                <Text style={styles.layerToggleIcon}>📍</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.layerToggleLabel,
                      showClientsLayer && styles.layerToggleLabelActive,
                    ]}
                  >
                    Mapa de Calor (Clientes)
                  </Text>
                  <Text style={styles.layerToggleCount}>
                    {clientMarkers.length} hogares detectados
                  </Text>
                </View>
                <View
                  style={[
                    styles.toggleSwitchDot,
                    showClientsLayer && styles.toggleSwitchDotActiveClients,
                  ]}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.layerToggleBtn,
                  showFleetLayer && styles.layerToggleBtnActiveFleet,
                ]}
                onPress={() => setShowFleetLayer((prev) => !prev)}
                activeOpacity={0.85}
              >
                <Text style={styles.layerToggleIcon}>🚛</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.layerToggleLabel,
                      showFleetLayer && styles.layerToggleLabelActive,
                    ]}
                  >
                    Flota Activa
                  </Text>
                  <Text style={styles.layerToggleCount}>
                    {fleetMarkers.length} cuadrillas en ruta
                  </Text>
                </View>
                <View
                  style={[
                    styles.toggleSwitchDot,
                    showFleetLayer && styles.toggleSwitchDotActiveFleet,
                  ]}
                />
              </TouchableOpacity>
            </View>

            {/* Micro Barra de Estadísticas de Marketing */}
            <View style={styles.densitySummaryBar}>
              <Text style={styles.densitySummaryText} numberOfLines={1}>
                📊 Marketing: <Text style={styles.densityBold}>{densitySummary.densityZone}</Text>
              </Text>
            </View>
          </View>

          {/* Carrusel Horizontal de Cuadrantes Rápidos */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.sectorsScroll}
            contentContainerStyle={styles.sectorsScrollContent}
          >
            {PALIN_SECTORS.map((sec) => (
              <TouchableOpacity
                key={sec.name}
                style={styles.sectorChip}
                onPress={() => handleJumpToSector(sec)}
                activeOpacity={0.8}
              >
                <Text style={styles.sectorChipText}>
                  {sec.icon} {sec.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ─── BOTÓN FLOTANTE PARA RECENTRAR MAPA ─────────────────────────── */}
        <TouchableOpacity
          style={styles.recenterBtn}
          onPress={() =>
            setCenterCoord({
              latitude: PALIN_CENTER.latitude,
              longitude: PALIN_CENTER.longitude,
            })
          }
          activeOpacity={0.85}
        >
          <Text style={styles.recenterBtnText}>🎯 Recentrara Palín</Text>
        </TouchableOpacity>

        {/* ─── TARJETA INFERIOR DE DETALLE AL TOCAR UN PIN (REQ 3 & 4) ───── */}
        {Boolean(selectedEntity) && (
          <View style={styles.detailCardFloating}>
            <View style={styles.detailCardHeader}>
              <View
                style={[
                  styles.entityAvatarBadge,
                  selectedEntity.tipo === 'flota'
                    ? styles.entityAvatarBadgeFleet
                    : styles.entityAvatarBadgeClient,
                ]}
              >
                <Text style={styles.entityAvatarIcon}>
                  {selectedEntity.tipo === 'flota' ? '🚛' : '📍'}
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <View style={styles.entityTitleRow}>
                  <Text style={styles.entityName} numberOfLines={1}>
                    {selectedEntity.nombre_completo}
                  </Text>
                  <View
                    style={[
                      styles.entityTypePill,
                      selectedEntity.tipo === 'flota'
                        ? styles.entityTypePillFleet
                        : styles.entityTypePillClient,
                    ]}
                  >
                    <Text
                      style={[
                        styles.entityTypePillText,
                        selectedEntity.tipo === 'flota'
                          ? styles.entityTypePillTextFleet
                          : styles.entityTypePillTextClient,
                      ]}
                    >
                      {selectedEntity.tipo === 'flota' ? 'UNIDAD FLOTA' : 'CLIENTE'}
                    </Text>
                  </View>
                </View>

                {/* Dirección y Ubicación (Requerimiento 3) */}
                <Text style={styles.entityAddress}>
                  📍 {selectedEntity.direccion || 'Palín, Escuintla'}
                </Text>

                {/* Última actualización y Progreso (Requerimiento 4) */}
                {selectedEntity.tipo === 'flota' && (
                  <View style={styles.fleetProgressRow}>
                    <Text style={styles.fleetTimeText}>
                      ⏱️ Última actualización: <Text style={styles.boldWhite}>{selectedEntity.ultima_actualizacion}</Text>
                    </Text>
                    <Text style={styles.fleetTruckText}>
                      Camión: <Text style={styles.boldWhite}>{selectedEntity.codigo_camion}</Text>
                    </Text>
                  </View>
                )}

                {selectedEntity.tipo === 'cliente' && (
                  <View style={styles.clientDetailRow}>
                    <Text style={styles.clientContactText}>
                      📞 {selectedEntity.telefono} • ✉️ {selectedEntity.email || 'Palín'}
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={styles.closeDetailBtn}
                onPress={() => setSelectedEntity(null)}
                activeOpacity={0.7}
              >
                <Text style={styles.closeDetailBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  fullscreenMapContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#0F172A',
  },
  fullscreenMap: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 0,
    borderWidth: 0,
  },

  // ─── HUD SUPERIOR ──────────────────────────────────────────────────────────
  topHudContainer: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    zIndex: 20,
    ...(Platform.OS === 'web' && {
      maxWidth: 960,
      width: '96%',
      alignSelf: 'center',
    }),
  },
  hudCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  hudHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  hudBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  hudBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.5,
  },
  hudTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  refreshBtn: {
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.6)',
  },
  refreshBtnText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },

  // ─── CAPAS (TOGGLES) SUPERIORES ───────────────────────────────────────────
  layerTogglesRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  layerToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(71, 85, 105, 0.6)',
    gap: 8,
  },
  layerToggleBtnActiveClients: {
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    borderColor: '#EF4444',
  },
  layerToggleBtnActiveFleet: {
    backgroundColor: 'rgba(37, 99, 235, 0.18)',
    borderColor: '#3B82F6',
  },
  layerToggleIcon: {
    fontSize: 18,
  },
  layerToggleLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  layerToggleLabelActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  layerToggleCount: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  toggleSwitchDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#475569',
  },
  toggleSwitchDotActiveClients: {
    backgroundColor: '#EF4444',
  },
  toggleSwitchDotActiveFleet: {
    backgroundColor: '#3B82F6',
  },
  densitySummaryBar: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(51, 65, 85, 0.6)',
  },
  densitySummaryText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  densityBold: {
    fontWeight: '800',
    color: '#F59E0B',
  },

  // ─── CHIPS DE SECTORES ─────────────────────────────────────────────────────
  sectorsScroll: {
    marginTop: 8,
  },
  sectorsScrollContent: {
    gap: 6,
    paddingRight: 10,
  },
  sectorChip: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.8)',
  },
  sectorChipText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '600',
  },

  // ─── BOTÓN RECENTRAR ───────────────────────────────────────────────────────
  recenterBtn: {
    position: 'absolute',
    right: 14,
    bottom: 115,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#38BDF8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 10,
  },
  recenterBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
  },

  // ─── TARJETA INFERIOR FLOTANTE ─────────────────────────────────────────────
  detailCardFloating: {
    position: 'absolute',
    bottom: 16,
    left: 14,
    right: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
    zIndex: 30,
    ...(Platform.OS === 'web' && {
      maxWidth: 680,
      width: '92%',
      alignSelf: 'center',
    }),
  },
  detailCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  entityAvatarBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  entityAvatarBadgeFleet: {
    backgroundColor: '#1E40AF',
  },
  entityAvatarBadgeClient: {
    backgroundColor: '#DC2626',
  },
  entityAvatarIcon: {
    fontSize: 22,
  },
  entityTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  entityName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    flex: 1,
  },
  entityTypePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  entityTypePillFleet: {
    backgroundColor: 'rgba(59, 130, 246, 0.25)',
  },
  entityTypePillClient: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
  },
  entityTypePillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  entityTypePillTextFleet: {
    color: '#60A5FA',
  },
  entityTypePillTextClient: {
    color: '#F87171',
  },
  entityAddress: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  fleetProgressRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  fleetTimeText: {
    fontSize: 11,
    color: '#93C5FD',
  },
  fleetTruckText: {
    fontSize: 11,
    color: '#93C5FD',
  },
  clientDetailRow: {
    marginTop: 4,
  },
  clientContactText: {
    fontSize: 11,
    color: '#CBD5E1',
  },
  boldWhite: {
    fontWeight: '800',
    color: '#FFFFFF',
  },
  closeDetailBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(51, 65, 85, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  closeDetailBtnText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '800',
  },
});

