import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/useAuthStore';
import { THEME } from '../../constants/theme';
import {
  getTrucks,
  createTruck,
  updateTruck,
  deleteTruck,
  getRoutes,
  createRoute,
  updateRoute,
  deleteRoute,
} from '../../api/logistics';

export default function SupervisorHomeScreen({ navigation }) {
  const profile = useAuthStore((state) => state.profile);
  const logout = useAuthStore((state) => state.logout);

  const [activeTab, setActiveTab] = useState('camiones'); // 'camiones' | 'rutas'
  const [trucks, setTrucks] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Estados para Modal de Camión
  const [truckModalVisible, setTruckModalVisible] = useState(false);
  const [editingTruck, setEditingTruck] = useState(null);
  const [truckCodigo, setTruckCodigo] = useState('');
  const [truckPlaca, setTruckPlaca] = useState('');
  const [truckActivo, setTruckActivo] = useState(true);
  const [isSavingTruck, setIsSavingTruck] = useState(false);

  // Estados para Modal de Ruta
  const [routeModalVisible, setRouteModalVisible] = useState(false);
  const [editingRoute, setEditingRoute] = useState(null);
  const [routeNombre, setRouteNombre] = useState('');
  const [routeDescripcion, setRouteDescripcion] = useState('');
  const [isSavingRoute, setIsSavingRoute] = useState(false);

  const loadData = useCallback(async (isPullToRefresh = false) => {
    if (isPullToRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const [trucksData, routesData] = await Promise.all([
        getTrucks(false),
        getRoutes(),
      ]);
      setTrucks(trucksData || []);
      setRoutes(routesData || []);
    } catch (err) {
      console.error('[SupervisorHome] Error cargando logística:', err);
      Alert.alert('Error', 'No se pudieron consultar los datos de logística en Supabase.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadData();
    });
    return unsubscribe;
  }, [navigation, loadData]);

  // ─── CRUD CAMIONES ────────────────────────────────────────────────────────
  const handleOpenTruckModal = (camion = null) => {
    if (camion) {
      setEditingTruck(camion);
      setTruckCodigo(camion.codigo || '');
      setTruckPlaca(camion.placa || '');
      setTruckActivo(camion.activo !== false);
    } else {
      setEditingTruck(null);
      setTruckCodigo('');
      setTruckPlaca('');
      setTruckActivo(true);
    }
    setTruckModalVisible(true);
  };

  const handleSaveTruck = async () => {
    if (!truckCodigo.trim()) {
      Alert.alert('Campo requerido', 'Por favor ingresa el código del camión (ej. CAM-05).');
      return;
    }

    setIsSavingTruck(true);
    try {
      if (editingTruck) {
        await updateTruck(editingTruck.id, {
          codigo: truckCodigo,
          placa: truckPlaca,
          activo: truckActivo,
        });
        Alert.alert('✅ Actualizado', `La unidad ${truckCodigo} ha sido modificada.`);
      } else {
        await createTruck({
          codigo: truckCodigo,
          placa: truckPlaca,
          activo: truckActivo,
        });
        Alert.alert('🎉 Camión Registrado', `Se agregó la unidad ${truckCodigo} a la flota municipal.`);
      }
      setTruckModalVisible(false);
      await loadData();
    } catch (err) {
      Alert.alert('Error', err.message || 'No se pudo guardar el camión en Supabase.');
    } finally {
      setIsSavingTruck(false);
    }
  };

  const handleDeleteTruck = (camion) => {
    Alert.alert(
      '⚠️ Eliminar Unidad',
      `¿Confirmas la eliminación del camión ${camion.codigo}? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTruck(camion.id);
              await loadData();
              Alert.alert('Eliminado', `La unidad ${camion.codigo} fue removida.`);
            } catch (err) {
              Alert.alert('Error', err.message || 'No se pudo eliminar el camión.');
            }
          },
        },
      ]
    );
  };

  // ─── CRUD RUTAS ───────────────────────────────────────────────────────────
  const handleOpenRouteModal = (ruta = null) => {
    if (ruta) {
      setEditingRoute(ruta);
      setRouteNombre(ruta.nombre || '');
      setRouteDescripcion(ruta.descripcion || '');
    } else {
      setEditingRoute(null);
      setRouteNombre('');
      setRouteDescripcion('');
    }
    setRouteModalVisible(true);
  };

  const handleSaveRoute = async () => {
    if (!routeNombre.trim()) {
      Alert.alert('Campo requerido', 'Por favor ingresa el nombre de la ruta.');
      return;
    }

    setIsSavingRoute(true);
    try {
      if (editingRoute) {
        await updateRoute(editingRoute.id, {
          nombre: routeNombre,
          descripcion: routeDescripcion,
        });
        Alert.alert('✅ Actualizado', 'La ruta fue actualizada con éxito.');
      } else {
        await createRoute({
          nombre: routeNombre,
          descripcion: routeDescripcion,
        });
        Alert.alert('🎉 Ruta Creada', 'La nueva ruta ha sido agregada al sistema.');
      }
      setRouteModalVisible(false);
      await loadData();
    } catch (err) {
      Alert.alert('Error', err.message || 'No se pudo guardar la ruta en Supabase.');
    } finally {
      setIsSavingRoute(false);
    }
  };

  const handleDeleteRoute = (ruta) => {
    Alert.alert(
      '⚠️ Eliminar Ruta',
      `¿Deseas eliminar la ruta "${ruta.nombre}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRoute(ruta.id);
              await loadData();
              Alert.alert('Eliminada', 'La ruta fue removida del catálogo.');
            } catch (err) {
              Alert.alert('Error', err.message || 'No se pudo eliminar la ruta.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={THEME.colors.background} />

      {/* Barra Superior con Rol y Logout */}
      <View style={styles.header}>
        <View style={styles.badgeRow}>
          <View style={[styles.roleTag, { backgroundColor: THEME.roles.supervisor }]}>
            <Text style={styles.roleTagText}>📋 Supervisor de Logística</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutBtnText}>Salir</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.welcomeText}>
          Panel Logístico: {profile?.nombre_completo || 'Supervisor'}
        </Text>
        <Text style={styles.deptText}>
          Flota Municipal y Rutas Territoriales • Palín
        </Text>

        {/* Pestañas de Alternancia: Camiones vs Rutas */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'camiones' && styles.tabButtonActive]}
            onPress={() => setActiveTab('camiones')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'camiones' && styles.tabButtonTextActive,
              ]}
            >
              🚛 Camiones ({trucks.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'rutas' && styles.tabButtonActive]}
            onPress={() => setActiveTab('rutas')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'rutas' && styles.tabButtonTextActive,
              ]}
            >
              📍 Rutas ({routes.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Botón de Agregar Nuevo Registro */}
      <View style={styles.actionHeaderBar}>
        <Text style={styles.sectionHeaderTitle}>
          {activeTab === 'camiones' ? 'Flota de Camiones Recolectores' : 'Catálogo de Rutas Oficiales'}
        </Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => (activeTab === 'camiones' ? handleOpenTruckModal() : handleOpenRouteModal())}
          activeOpacity={0.85}
        >
          <Text style={styles.addButtonText}>
            {activeTab === 'camiones' ? '+ Nuevo Camión' : '+ Nueva Ruta'}
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={THEME.roles.supervisor} />
          <Text style={styles.loadingText}>Cargando recursos logísticos...</Text>
        </View>
      ) : activeTab === 'camiones' ? (
        /* LISTADO DE CAMIONES */
        <FlatList
          data={trucks}
          keyExtractor={(item) => item.id?.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadData(true)}
              colors={[THEME.roles.supervisor]}
              tintColor={THEME.roles.supervisor}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🚛</Text>
              <Text style={styles.emptyTitle}>Sin camiones registrados</Text>
              <Text style={styles.emptyDesc}>
                Pulsa "+ Nuevo Camión" para registrar la primera unidad vehicular en Supabase.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isActive = item.activo !== false;
            return (
              <View style={[styles.card, !isActive && styles.cardInactive]}>
                <View style={styles.cardTopRow}>
                  <View style={styles.truckIconBadge}>
                    <Text style={styles.truckIconText}>🚛</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.cardMainTitle}>{item.codigo}</Text>
                    <Text style={styles.cardSubTitle}>Placa: {item.placa || 'PENDIENTE'}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      isActive ? styles.statusPillActive : styles.statusPillInactive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        isActive ? styles.statusPillTextActive : styles.statusPillTextInactive,
                      ]}
                    >
                      {isActive ? 'En Operación' : 'Mantenimiento'}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardActionsRow}>
                  <TouchableOpacity
                    style={styles.cardActionEdit}
                    onPress={() => handleOpenTruckModal(item)}
                  >
                    <Text style={styles.cardActionEditText}>✏️ Editar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.cardActionDelete}
                    onPress={() => handleDeleteTruck(item)}
                  >
                    <Text style={styles.cardActionDeleteText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      ) : (
        /* LISTADO DE RUTAS */
        <FlatList
          data={routes}
          keyExtractor={(item) => item.id?.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadData(true)}
              colors={[THEME.roles.supervisor]}
              tintColor={THEME.roles.supervisor}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🗺️</Text>
              <Text style={styles.emptyTitle}>Sin rutas registradas</Text>
              <Text style={styles.emptyDesc}>
                Pulsa "+ Nueva Ruta" para crear un sector territorial de recolección en Supabase.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTopRow}>
                <View style={[styles.truckIconBadge, { backgroundColor: '#FEF3C7' }]}>
                  <Text style={styles.truckIconText}>📍</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.cardMainTitle}>{item.nombre}</Text>
                  <Text style={styles.cardSubTitle}>
                    {item.descripcion || 'Sector territorial de recolección'}
                  </Text>
                </View>
              </View>

              <View style={styles.cardActionsRow}>
                <TouchableOpacity
                  style={styles.cardActionEdit}
                  onPress={() => handleOpenRouteModal(item)}
                >
                  <Text style={styles.cardActionEditText}>✏️ Editar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cardActionDelete}
                  onPress={() => handleDeleteRoute(item)}
                >
                  <Text style={styles.cardActionDeleteText}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* ─── MODAL CAMIÓN ─────────────────────────────────────────────────── */}
      <Modal visible={truckModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingTruck ? 'Editar Unidad' : 'Registrar Nuevo Camión'}
            </Text>
            <Text style={styles.modalSubtitle}>
              Datos oficiales de la flota de recolección de Palín.
            </Text>

            <Text style={styles.inputLabel}>Código de Camión *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej. CAM-05"
              value={truckCodigo}
              onChangeText={setTruckCodigo}
              autoCapitalize="characters"
            />

            <Text style={styles.inputLabel}>Número de Placa</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej. C-923BKS"
              value={truckPlaca}
              onChangeText={setTruckPlaca}
              autoCapitalize="characters"
            />

            <Text style={styles.inputLabel}>Estado Operativo</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, truckActivo && styles.toggleBtnActive]}
                onPress={() => setTruckActivo(true)}
              >
                <Text style={[styles.toggleBtnText, truckActivo && styles.toggleBtnTextActive]}>
                  🟢 En Operación
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, !truckActivo && styles.toggleBtnInactive]}
                onPress={() => setTruckActivo(false)}
              >
                <Text style={[styles.toggleBtnText, !truckActivo && styles.toggleBtnTextInactive]}>
                  🔴 Mantenimiento
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => setTruckModalVisible(false)}
                disabled={isSavingTruck}
              >
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnSave, isSavingTruck && styles.modalBtnSaveDisabled]}
                onPress={handleSaveTruck}
                disabled={isSavingTruck}
              >
                {isSavingTruck ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalBtnSaveText}>Guardar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL RUTA ───────────────────────────────────────────────────── */}
      <Modal visible={routeModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingRoute ? 'Editar Ruta' : 'Crear Nueva Ruta'}
            </Text>
            <Text style={styles.modalSubtitle}>
              Definición territorial para los camiones de Palín.
            </Text>

            <Text style={styles.inputLabel}>Nombre de la Ruta *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej. Zona 6 — Rincón Grande y Periférico"
              value={routeNombre}
              onChangeText={setRouteNombre}
            />

            <Text style={styles.inputLabel}>Descripción / Sectores que Abarca</Text>
            <TextInput
              style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
              placeholder="Ej. Callejones 1 al 4, sector de la línea férrea..."
              value={routeDescripcion}
              onChangeText={setRouteDescripcion}
              multiline={true}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => setRouteModalVisible(false)}
                disabled={isSavingRoute}
              >
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnSave, isSavingRoute && styles.modalBtnSaveDisabled]}
                onPress={handleSaveRoute}
                disabled={isSavingRoute}
              >
                {isSavingRoute ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalBtnSaveText}>Guardar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  roleTag: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
  },
  roleTagText: {
    color: '#FFFFFF',
    fontWeight: '800',
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
  welcomeText: {
    fontSize: 20,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  deptText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
    marginBottom: 12,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 9,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
  },
  tabButtonTextActive: {
    color: THEME.roles.supervisor,
    fontWeight: '800',
  },
  actionHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    ...(Platform.OS === 'web' && {
      maxWidth: 1200,
      width: '100%',
      alignSelf: 'center',
    }),
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  addButton: {
    backgroundColor: THEME.roles.supervisor,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  listContent: {
    paddingHorizontal: 20,
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
  emptyContainer: {
    alignItems: 'center',
    padding: 30,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  emptyDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardInactive: {
    backgroundColor: '#FFF7F7',
    borderColor: '#FECACA',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  truckIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  truckIconText: {
    fontSize: 22,
  },
  cardMainTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  cardSubTitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusPillActive: {
    backgroundColor: '#DCFCE7',
  },
  statusPillInactive: {
    backgroundColor: '#FEE2E2',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusPillTextActive: {
    color: '#15803D',
  },
  statusPillTextInactive: {
    color: '#DC2626',
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  cardActionEdit: {
    flex: 1,
    paddingVertical: 7,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardActionEditText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  cardActionDelete: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    alignItems: 'center',
  },
  cardActionDeleteText: {
    fontSize: 13,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginBottom: 16,
    marginTop: 2,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 5,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: THEME.colors.textPrimary,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  toggleBtnInactive: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
  },
  toggleBtnTextActive: {
    color: '#15803D',
    fontWeight: '800',
  },
  toggleBtnTextInactive: {
    color: '#B91C1C',
    fontWeight: '800',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    alignItems: 'center',
  },
  modalBtnCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  modalBtnSave: {
    flex: 1.5,
    paddingVertical: 12,
    backgroundColor: THEME.roles.supervisor,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalBtnSaveDisabled: {
    opacity: 0.7,
  },
  modalBtnSaveText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
