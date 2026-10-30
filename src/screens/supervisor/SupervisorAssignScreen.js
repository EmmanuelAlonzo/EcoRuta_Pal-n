import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { THEME } from '../../constants/theme';
import {
  getPersonnelList,
  getTrucks,
  getRoutes,
  assignPersonnelRoute,
} from '../../api/logistics';

export default function SupervisorAssignScreen({ navigation }) {
  const [personnel, setPersonnel] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Selecciones activas para la asignación
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [selectedTruck, setSelectedTruck] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  const loadData = useCallback(async (isPullToRefresh = false) => {
    if (isPullToRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const [staffData, trucksData, routesData] = await Promise.all([
        getPersonnelList(),
        getTrucks(true), // Solo camiones activos
        getRoutes(),
      ]);

      // Filtrar solo personal operativo (operarios y pilotos activos)
      const operationalStaff = (staffData || []).filter(
        (p) => (p.rol === 'operario' || p.rol === 'piloto') && p.activo !== false
      );

      setPersonnel(operationalStaff);
      setTrucks(trucksData || []);
      setRoutes(routesData || []);

      // Auto-seleccionar primer elemento si no hay ninguno seleccionado
      if (operationalStaff.length > 0 && !selectedStaff) {
        setSelectedStaff(operationalStaff[0]);
        setSelectedTruck(operationalStaff[0].codigo_camion || (trucksData[0]?.codigo || 'CAM-01'));
        setSelectedRoute(operationalStaff[0].ruta_asignada || (routesData[0]?.nombre || 'Zona 1'));
      }
    } catch (err) {
      console.error('[SupervisorAssign] Error cargando asignaciones:', err);
      Alert.alert('Error', 'No se pudieron consultar los datos para asignación de personal.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedStaff]);

  useEffect(() => {
    loadData();
    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadData();
    });
    return unsubscribe;
  }, [navigation, loadData]);

  const handleSelectStaff = (staff) => {
    setSelectedStaff(staff);
    if (staff.codigo_camion) {
      setSelectedTruck(staff.codigo_camion);
    }
    if (staff.ruta_asignada) {
      setSelectedRoute(staff.ruta_asignada);
    }
  };

  const handleSaveAssignment = async () => {
    if (!selectedStaff?.id) {
      Alert.alert('Selección requerida', 'Por favor selecciona al colaborador que deseas asignar.');
      return;
    }

    if (!selectedTruck || !selectedRoute) {
      Alert.alert('Selección requerida', 'Debes seleccionar un camión y una ruta para completar la asignación.');
      return;
    }

    setIsAssigning(true);
    try {
      await assignPersonnelRoute(selectedStaff.id, {
        codigo_camion: selectedTruck,
        ruta_asignada: selectedRoute,
      });

      await loadData();
      Alert.alert(
        '✅ Asignación Guardada',
        `Se asignó el camión "${selectedTruck}" y la ruta "${selectedRoute}" a ${selectedStaff.nombre_completo}. Cuando inicie sesión, sus selectores aparecerán autocompletados.`
      );
    } catch (err) {
      console.error('[SupervisorAssign] Error guardando asignación:', err);
      Alert.alert('Error al asignar', err.message || 'No se pudo actualizar el perfil en Supabase.');
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={THEME.colors.background} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>📋 Asignación de Turnos</Text>
        <Text style={styles.headerSubtitle}>
          Asigna camión y ruta territorial a operarios y pilotos de Palín
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={THEME.roles.supervisor} />
          <Text style={styles.loadingText}>Cargando personal y unidades activas...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadData(true)}
              colors={[THEME.roles.supervisor]}
              tintColor={THEME.roles.supervisor}
            />
          }
        >
          {/* PASO 1: SELECCIONAR COLABORADOR */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. Selecciona al Colaborador</Text>
            <Text style={styles.sectionDesc}>Personal de campo activo (Operarios y Pilotos):</Text>

            {personnel.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No hay operarios ni pilotos activos en este momento.</Text>
              </View>
            ) : (
              <View style={styles.staffGrid}>
                {personnel.map((staff) => {
                  const isSelected = selectedStaff?.id === staff.id;
                  const isPiloto = staff.rol === 'piloto';

                  return (
                    <TouchableOpacity
                      key={staff.id}
                      style={[styles.staffCard, isSelected && styles.staffCardSelected]}
                      onPress={() => handleSelectStaff(staff)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.staffIconCircle}>
                        <Text style={styles.staffIcon}>{isPiloto ? '🧑‍✈️' : '🚛'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.staffName, isSelected && styles.staffNameSelected]}>
                          {staff.nombre_completo || 'Colaborador'}
                        </Text>
                        <Text style={styles.staffSub}>
                          {isPiloto ? 'Piloto Oficial' : 'Operario de Ruta'} • {staff.email || 'Palín'}
                        </Text>
                        <Text style={styles.staffCurrent}>
                          Actual: {staff.codigo_camion || 'Sin camión'} • {staff.ruta_asignada || 'Sin ruta'}
                        </Text>
                      </View>
                      <View style={[styles.radioDot, isSelected && styles.radioDotSelected]}>
                        {isSelected && <View style={styles.radioDotInner} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* PASO 2: SELECCIONAR CAMIÓN */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. Selecciona el Camión de Flota</Text>
            <Text style={styles.sectionDesc}>Unidades operativas disponibles en Supabase:</Text>

            <View style={styles.trucksRow}>
              {trucks.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No hay camiones registrados en la tabla `camiones`.</Text>
                </View>
              ) : (
                trucks.map((t) => {
                  const isSelected = selectedTruck === t.codigo;
                  return (
                    <TouchableOpacity
                      key={t.id?.toString()}
                      style={[styles.truckChip, isSelected && styles.truckChipSelected]}
                      onPress={() => setSelectedTruck(t.codigo)}
                    >
                      <Text style={styles.truckChipIcon}>🚛</Text>
                      <Text style={[styles.truckChipText, isSelected && styles.truckChipTextSelected]}>
                        {t.codigo}
                      </Text>
                      <Text style={[styles.truckChipPlaca, isSelected && styles.truckChipPlacaSelected]}>
                        {t.placa || 'En ruta'}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </View>

          {/* PASO 3: SELECCIONAR RUTA */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3. Selecciona la Ruta Territorial</Text>
            <Text style={styles.sectionDesc}>Sectores oficiales definidos para Palín:</Text>

            <View style={styles.routesList}>
              {routes.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No hay rutas registradas en la tabla `rutas`.</Text>
                </View>
              ) : (
                routes.map((r) => {
                  const isSelected = selectedRoute === r.nombre;
                  return (
                    <TouchableOpacity
                      key={r.id?.toString()}
                      style={[styles.routeSelectCard, isSelected && styles.routeSelectCardSelected]}
                      onPress={() => setSelectedRoute(r.nombre)}
                    >
                      <Text style={styles.routeIcon}>📍</Text>
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={[styles.routeSelectName, isSelected && styles.routeSelectNameSelected]}>
                          {r.nombre}
                        </Text>
                        {r.descripcion ? (
                          <Text style={styles.routeSelectDesc}>{r.descripcion}</Text>
                        ) : null}
                      </View>
                      <View style={[styles.radioDot, isSelected && styles.radioDotSelected]}>
                        {isSelected && <View style={styles.radioDotInner} />}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </View>

          {/* RESUMEN DE ASIGNACIÓN Y BOTÓN */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>📌 Resumen de la Asignación:</Text>
            <Text style={styles.summaryLine}>
              • Colaborador: <Text style={styles.summaryBold}>{selectedStaff?.nombre_completo || 'Ninguno'}</Text>
            </Text>
            <Text style={styles.summaryLine}>
              • Camión: <Text style={styles.summaryBold}>{selectedTruck || 'Ninguno'}</Text>
            </Text>
            <Text style={styles.summaryLine}>
              • Ruta: <Text style={styles.summaryBold}>{selectedRoute || 'Ninguna'}</Text>
            </Text>

            <TouchableOpacity
              style={[styles.confirmBtn, isAssigning && styles.confirmBtnDisabled]}
              onPress={handleSaveAssignment}
              disabled={isAssigning}
              activeOpacity={0.85}
            >
              {isAssigning ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmBtnText}>Confirmar y Guardar Asignación 📌</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
    ...(Platform.OS === 'web' && {
      maxWidth: 1200,
      width: '100%',
      alignSelf: 'center',
    }),
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    ...(Platform.OS === 'web' && {
      maxWidth: 1200,
      width: '100%',
      alignSelf: 'center',
    }),
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 10,
    fontWeight: '600',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 2,
  },
  sectionDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginBottom: 10,
  },
  emptyCard: {
    padding: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
  },
  staffGrid: {
    gap: 8,
  },
  staffCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
  },
  staffCardSelected: {
    borderColor: THEME.roles.supervisor,
    backgroundColor: '#FEF3C7',
    elevation: 2,
  },
  staffIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  staffIcon: {
    fontSize: 18,
  },
  staffName: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  staffNameSelected: {
    color: '#92400E',
    fontWeight: '800',
  },
  staffSub: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 1,
  },
  staffCurrent: {
    fontSize: 10,
    fontWeight: '600',
    color: '#059669',
    marginTop: 2,
  },
  radioDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  radioDotSelected: {
    borderColor: THEME.roles.supervisor,
  },
  radioDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: THEME.roles.supervisor,
  },
  trucksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  truckChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    minWidth: 85,
  },
  truckChipSelected: {
    borderColor: THEME.roles.supervisor,
    backgroundColor: '#FEF3C7',
  },
  truckChipIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  truckChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  truckChipTextSelected: {
    color: '#92400E',
  },
  truckChipPlaca: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    marginTop: 1,
  },
  truckChipPlacaSelected: {
    color: '#B45309',
    fontWeight: '600',
  },
  routesList: {
    gap: 8,
  },
  routeSelectCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
  },
  routeSelectCardSelected: {
    borderColor: THEME.roles.supervisor,
    backgroundColor: '#FEF3C7',
  },
  routeIcon: {
    fontSize: 18,
  },
  routeSelectName: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  routeSelectNameSelected: {
    color: '#92400E',
    fontWeight: '800',
  },
  routeSelectDesc: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
    marginTop: 6,
    shadowColor: THEME.roles.supervisor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 8,
  },
  summaryLine: {
    fontSize: 12,
    color: '#78350F',
    marginBottom: 3,
  },
  summaryBold: {
    fontWeight: '800',
    color: '#B45309',
  },
  confirmBtn: {
    backgroundColor: THEME.roles.supervisor,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  confirmBtnDisabled: {
    opacity: 0.7,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
});
