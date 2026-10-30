import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/useAuthStore';
import { supabase } from '../../services/supabase';
import { THEME } from '../../constants/theme';
import { getTrucks, getRoutes } from '../../api/logistics';

// Catálogo de respaldo (fallback) en caso de tablas vacías o desconexión temporal
const DEFAULT_CAMIONES = [
  { id: '1', codigo: 'CAM-01', placa: 'C-821BKN', descripcion: 'Compactador Principal (Centro y Comercio)', icon: '🚛' },
  { id: '2', codigo: 'CAM-02', placa: 'C-714BLP', descripcion: 'Recolector Selectivo (Reciclaje y Secos)', icon: '♻️' },
  { id: '3', codigo: 'CAM-03', placa: 'C-552BMQ', descripcion: 'Unidad Liviana (Sectores Angostos y Callejones)', icon: '🛻' },
  { id: '4', codigo: 'CAM-04', placa: 'C-319BNR', descripcion: 'Unidad Periférica (Aldeas y Caseríos)', icon: '🚚' },
];

const DEFAULT_RUTAS = [
  { id: '1', nombre: 'Zona 1 — Casco Urbano y Mercado Central', descripcion: 'Sector 1: Área comercial y cuadrante céntrico' },
  { id: '2', nombre: 'Zona 2 — Barrio San Pedro y San José', descripcion: 'Sector 2: Cuadrante este y áreas residenciales' },
  { id: '3', nombre: 'Zona 3 — Col. María Matos y San Francisco', descripcion: 'Sector 3: Cuadrante norte y colonias principales' },
  { id: '4', nombre: 'Zona 4 — Valle de las Flores y El Castaño', descripcion: 'Sector 4: Sectores residenciales del sur' },
  { id: '5', nombre: 'Zona 5 — Rincón de la Cruz y Periférico Sur', descripcion: 'Sector 5: Comunidades y perímetro exterior' },
];

export default function OperatorSetupScreen({ navigation }) {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const logout = useAuthStore((state) => state.logout);

  const [trucksList, setTrucksList] = useState([]);
  const [routesList, setRoutesList] = useState([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pre-cargar valores asignados por el supervisor si existen en el perfil
  const [selectedTruck, setSelectedTruck] = useState(profile?.codigo_camion || '');
  const [selectedRoute, setSelectedRoute] = useState(profile?.ruta_asignada || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Consulta en tiempo real a Supabase (tablas `camiones` y `rutas`)
  const loadLogisticsCatalog = useCallback(async (isPull = false) => {
    if (isPull) {
      setIsRefreshing(true);
    } else {
      setIsLoadingCatalog(true);
    }

    try {
      const [remoteTrucks, remoteRoutes] = await Promise.all([
        getTrucks(true), // SELECT * FROM camiones WHERE activo = true
        getRoutes(),     // SELECT * FROM rutas
      ]);

      const finalTrucks = remoteTrucks && remoteTrucks.length > 0 ? remoteTrucks : DEFAULT_CAMIONES;
      const finalRoutes = remoteRoutes && remoteRoutes.length > 0 ? remoteRoutes : DEFAULT_RUTAS;

      setTrucksList(finalTrucks);
      setRoutesList(finalRoutes);

      // Si el perfil ya tiene camión y ruta pre-asignados por el supervisor, mantenerlos seleccionados
      if (profile?.codigo_camion) {
        setSelectedTruck(profile.codigo_camion);
      } else if (!selectedTruck && finalTrucks.length > 0) {
        setSelectedTruck(finalTrucks[0].codigo);
      }

      if (profile?.ruta_asignada) {
        setSelectedRoute(profile.ruta_asignada);
      } else if (!selectedRoute && finalRoutes.length > 0) {
        setSelectedRoute(finalRoutes[0].nombre);
      }
    } catch (err) {
      console.warn('[OperatorSetup] Fallo al cargar catálogo remoto, aplicando fallback local:', err.message);
      setTrucksList(DEFAULT_CAMIONES);
      setRoutesList(DEFAULT_RUTAS);
      if (!selectedTruck) setSelectedTruck(DEFAULT_CAMIONES[0].codigo);
      if (!selectedRoute) setSelectedRoute(DEFAULT_RUTAS[0].nombre);
    } finally {
      setIsLoadingCatalog(false);
      setIsRefreshing(false);
    }
  }, [profile?.codigo_camion, profile?.ruta_asignada, selectedTruck, selectedRoute]);

  useEffect(() => {
    loadLogisticsCatalog();
    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadLogisticsCatalog();
    });
    return unsubscribe;
  }, [navigation, loadLogisticsCatalog]);

  const hasSupervisorAssignment = Boolean(profile?.codigo_camion || profile?.ruta_asignada);

  /**
   * Confirma la asignación del turno:
   * 1. Actualiza `perfiles` en Supabase (codigo_camion y ruta_asignada)
   * 2. Actualiza el estado global de Zustand
   * 3. Desbloquea el acceso a las funciones operativas (Escáner y Ruta)
   */
  const handleConfirmShift = async () => {
    if (!selectedTruck || !selectedRoute) {
      Alert.alert(
        'Datos incompletos',
        'Por favor selecciona tu camión y la ruta asignada para el turno de hoy.'
      );
      return;
    }

    if (!user?.id) {
      Alert.alert('Error', 'No se encontró la sesión del operario.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Actualizar en la base de datos de Supabase
      const { error: updateError } = await supabase
        .from('perfiles')
        .update({
          codigo_camion: selectedTruck,
          ruta_asignada: selectedRoute,
        })
        .eq('id', user.id);

      if (updateError) {
        console.error('[OperatorSetup] Error actualizando perfil en Supabase:', updateError);
        throw updateError;
      }

      // 2. Actualizar Zustand con bandera de turno activo
      const currentProfile = useAuthStore.getState().profile || {};
      useAuthStore.setState({
        profile: {
          ...currentProfile,
          codigo_camion: selectedTruck,
          ruta_asignada: selectedRoute,
          shiftActive: true,
        },
      });

      console.log(`✅ [OperatorSetup] Turno confirmado: Camión=${selectedTruck}, Ruta=${selectedRoute}`);

      // 3. Redirigir a las pestañas principales del operario
      if (navigation?.replace) {
        navigation.replace('OperatorTabs');
      } else if (navigation?.navigate) {
        navigation.navigate('OperatorTabs');
      }
    } catch (err) {
      console.error('[OperatorSetup] Error al iniciar turno:', err);
      Alert.alert(
        'Fallo de inicialización',
        err.message || 'No se pudo guardar la configuración de tu ruta. Verifica tu conexión.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={THEME.colors.background} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadLogisticsCatalog(true)}
            colors={[THEME.roles.operario]}
            tintColor={THEME.roles.operario}
          />
        }
      >
        {/* Barra Superior con Rol y Salida */}
        <View style={styles.topBar}>
          <View style={styles.badgeRow}>
            <View style={styles.roleTag}>
              <Text style={styles.roleTagText}>🚛 Operario Municipal</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.8}>
            <Text style={styles.logoutBtnText}>Cerrar Sesión</Text>
          </TouchableOpacity>
        </View>

        {/* Encabezado Institucional */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Text style={styles.headerEmoji}>🗺️</Text>
          </View>
          <Text style={styles.title}>Inicialización de Turno</Text>
          <Text style={styles.subtitle}>
            Municipalidad de Palín • Gestión Ambiental
          </Text>
          <Text style={styles.description}>
            Para habilitar el escáner QR y registrar las recolecciones, confirma
            el camión y la ruta territorial de hoy.
          </Text>
        </View>

        {/* Aviso de Pre-Asignación por el Supervisor */}
        {hasSupervisorAssignment ? (
          <View style={styles.supervisorAlertCard}>
            <Text style={styles.supervisorAlertIcon}>✨</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.supervisorAlertTitle}>Asignación Previa por Supervisor</Text>
              <Text style={styles.supervisorAlertText}>
                Tu supervisor de logística ha pre-asignado la unidad{' '}
                <Text style={styles.bold}>{profile?.codigo_camion || 'CAM-01'}</Text> y la ruta{' '}
                <Text style={styles.bold}>{profile?.ruta_asignada || 'Zona 1'}</Text>. Los selectores han sido autocompletados.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Operario Activo */}
        <View style={styles.operatorCard}>
          <View style={styles.operatorAvatar}>
            <Text style={styles.operatorAvatarText}>👤</Text>
          </View>
          <View style={styles.operatorInfo}>
            <Text style={styles.operatorLabel}>OPERARIO RESPONSABLE</Text>
            <Text style={styles.operatorName}>
              {profile?.nombre_completo || profile?.nombre || 'Operario de Ruta'}
            </Text>
            <Text style={styles.operatorEmail}>{user?.email || 'operario@palin.gob.gt'}</Text>
          </View>
        </View>

        {isLoadingCatalog ? (
          <View style={styles.catalogLoadingBox}>
            <ActivityIndicator size="small" color={THEME.roles.operario} />
            <Text style={styles.catalogLoadingText}>Cargando flota y rutas desde Supabase...</Text>
          </View>
        ) : (
          <>
            {/* ── SELECTOR 1: CÓDIGO DE CAMIÓN (SUPABASE) ── */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>🚛</Text>
                <Text style={styles.sectionTitle}>1. Selecciona el Código de Camión</Text>
              </View>
              <Text style={styles.sectionDesc}>
                Unidades vehiculares activas registradas en la base de datos:
              </Text>

              <View style={styles.optionsGrid}>
                {trucksList.map((camion) => {
                  const isSelected = selectedTruck === camion.codigo;
                  return (
                    <TouchableOpacity
                      key={camion.id?.toString() || camion.codigo}
                      style={[
                        styles.optionCard,
                        isSelected && styles.optionCardSelected,
                      ]}
                      onPress={() => setSelectedTruck(camion.codigo)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.optionCardHeader}>
                        <Text style={styles.truckIcon}>{camion.icon || '🚛'}</Text>
                        <Text
                          style={[
                            styles.truckCode,
                            isSelected && styles.truckCodeSelected,
                          ]}
                        >
                          {camion.codigo}
                        </Text>
                        <View
                          style={[
                            styles.radioIndicator,
                            isSelected && styles.radioIndicatorSelected,
                          ]}
                        >
                          {isSelected && <View style={styles.radioInner} />}
                        </View>
                      </View>
                      <Text style={styles.truckDesc}>
                        Placa: {camion.placa || 'En circulación'}{' '}
                        {camion.descripcion ? `• ${camion.descripcion}` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── SELECTOR 2: RUTA ASIGNADA (SUPABASE) ── */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>📍</Text>
                <Text style={styles.sectionTitle}>2. Selecciona la Ruta Asignada</Text>
              </View>
              <Text style={styles.sectionDesc}>
                Sectores territoriales de recolección en Palín:
              </Text>

              <View style={styles.optionsList}>
                {routesList.map((ruta) => {
                  const isSelected = selectedRoute === ruta.nombre;
                  return (
                    <TouchableOpacity
                      key={ruta.id?.toString() || ruta.nombre}
                      style={[
                        styles.routeCard,
                        isSelected && styles.routeCardSelected,
                      ]}
                      onPress={() => setSelectedRoute(ruta.nombre)}
                      activeOpacity={0.85}
                    >
                      <View
                        style={[
                          styles.routeBadge,
                          isSelected && styles.routeBadgeSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.routeBadgeText,
                            isSelected && styles.routeBadgeTextSelected,
                          ]}
                        >
                          📍
                        </Text>
                      </View>
                      <View style={styles.routeDetails}>
                        <Text
                          style={[
                            styles.routeName,
                            isSelected && styles.routeNameSelected,
                          ]}
                        >
                          {ruta.nombre}
                        </Text>
                        {ruta.descripcion ? (
                          <Text style={styles.routeDescText}>{ruta.descripcion}</Text>
                        ) : null}
                      </View>
                      <View
                        style={[
                          styles.radioIndicator,
                          isSelected && styles.radioIndicatorSelected,
                        ]}
                      >
                        {isSelected && <View style={styles.radioInner} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </>
        )}

        {/* Resumen de Confirmación */}
        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>📋 Resumen del Turno:</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>• Camión:</Text>
            <Text style={styles.summaryValue}>{selectedTruck || 'Por seleccionar'}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>• Ruta:</Text>
            <Text style={styles.summaryValue}>{selectedRoute || 'Por seleccionar'}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>• Origen de datos:</Text>
            <Text style={styles.summaryValue}>Supabase Cloud (Tablas camiones y rutas)</Text>
          </View>
        </View>

        {/* Botón Principal de Confirmación */}
        <TouchableOpacity
          style={[styles.primaryButton, (isSubmitting || isLoadingCatalog) && styles.primaryButtonDisabled]}
          onPress={handleConfirmShift}
          disabled={isSubmitting || isLoadingCatalog}
          activeOpacity={0.85}
        >
          {isSubmitting ? (
            <View style={styles.buttonLoadingRow}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.primaryButtonText}> Guardando en Supabase...</Text>
            </View>
          ) : (
            <Text style={styles.primaryButtonText}>
              Confirmar Turno y Habilitar Escáner 🚛
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  badgeRow: {
    flexDirection: 'row',
  },
  roleTag: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  roleTagText: {
    color: '#1E40AF',
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
    fontWeight: '700',
    fontSize: 12,
  },
  header: {
    alignItems: 'center',
    marginBottom: 14,
    textAlign: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#BFDBFE',
  },
  headerEmoji: {
    fontSize: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.roles.operario,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 12,
    lineHeight: 18,
  },
  supervisorAlertCard: {
    flexDirection: 'row',
    backgroundColor: '#FEF3C7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
  },
  supervisorAlertIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  supervisorAlertTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
  },
  supervisorAlertText: {
    fontSize: 11,
    color: '#78350F',
    marginTop: 2,
    lineHeight: 15,
  },
  bold: {
    fontWeight: '800',
    color: '#B45309',
  },
  operatorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  operatorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  operatorAvatarText: {
    fontSize: 22,
  },
  operatorInfo: {
    flex: 1,
  },
  operatorLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
    letterSpacing: 0.5,
  },
  operatorName: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  operatorEmail: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
  },
  catalogLoadingBox: {
    padding: 20,
    alignItems: 'center',
  },
  catalogLoadingText: {
    marginTop: 8,
    fontSize: 12,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionIcon: {
    fontSize: 18,
    marginRight: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  sectionDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginBottom: 10,
  },
  optionsGrid: {
    gap: 10,
  },
  optionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
  },
  optionCardSelected: {
    borderColor: THEME.roles.operario,
    backgroundColor: '#EFF6FF',
    shadowColor: THEME.roles.operario,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  optionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  truckIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  truckCode: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    flex: 1,
  },
  truckCodeSelected: {
    color: '#1D4ED8',
  },
  truckDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginLeft: 28,
  },
  radioIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioIndicatorSelected: {
    borderColor: THEME.roles.operario,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: THEME.roles.operario,
  },
  optionsList: {
    gap: 8,
  },
  routeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
  },
  routeCardSelected: {
    borderColor: THEME.roles.operario,
    backgroundColor: '#EFF6FF',
    elevation: 2,
  },
  routeBadge: {
    backgroundColor: '#F1F5F9',
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  routeBadgeSelected: {
    backgroundColor: '#DBEAFE',
  },
  routeBadgeText: {
    fontSize: 16,
  },
  routeDetails: {
    flex: 1,
    marginRight: 8,
  },
  routeName: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  routeNameSelected: {
    color: '#1D4ED8',
    fontWeight: '800',
  },
  routeDescText: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  summaryBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  summaryLabel: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    maxWidth: '65%',
    textAlign: 'right',
  },
  primaryButton: {
    backgroundColor: THEME.roles.operario,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: THEME.roles.operario,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  buttonLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
});
