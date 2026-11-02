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
  getGeoreferencedCollections,
  PALIN_QUADRANTS,
} from '../../api/logistics';
import EcoMap from '../../components/common/EcoMap';

export default function SupervisorHomeScreen({ navigation }) {
  const profile = useAuthStore((state) => state.profile);
  const logout = useAuthStore((state) => state.logout);

  const [activeTab, setActiveTab] = useState('camiones'); // 'camiones' | 'rutas' | 'mapa'
  const [trucks, setTrucks] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [geoCollections, setGeoCollections] = useState([]);
  const [selectedGeoPoint, setSelectedGeoPoint] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Estados para Modal de Camión
  const [truckModalVisible, setTruckModalVisible] = useState(false);
  const [editingTruck, setEditingTruck] = useState(null);
  const [truckCodigo, setTruckCodigo] = useState('');
  const [truckPlaca, setTruckPlaca] = useState('');
  const [truckActivo, setTruckActivo] = useState(true);
  const [isSavingTruck, setIsSavingTruck] = useState(false);

  // Estados para Modal de Ruta y Selección Geográfica
  const [routeModalVisible, setRouteModalVisible] = useState(false);
  const [editingRoute, setEditingRoute] = useState(null);
  const [routeNombre, setRouteNombre] = useState('');
  const [routeDescripcion, setRouteDescripcion] = useState('');
  const [routePolygon, setRoutePolygon] = useState([]);
  const [isSavingRoute, setIsSavingRoute] = useState(false);

  const loadData = useCallback(async (isPullToRefresh = false) => {
    if (isPullToRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const [trucksData, routesData, collectionsData] = await Promise.all([
        getTrucks(false),
        getRoutes(),
        getGeoreferencedCollections(),
      ]);
      setTrucks(trucksData || []);
      setRoutes(routesData || []);
      setGeoCollections(collectionsData || []);
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

  // ─── CRUD RUTAS Y SELECCIÓN GEOGRÁFICA ────────────────────────────────────
  const handleOpenRouteModal = (ruta = null) => {
    if (ruta) {
      setEditingRoute(ruta);
      setRouteNombre(ruta.nombre || '');
      setRouteDescripcion(ruta.descripcion || '');
      setRoutePolygon(Array.isArray(ruta.geometria_ruta) ? ruta.geometria_ruta : []);
    } else {
      setEditingRoute(null);
      setRouteNombre('');
      setRouteDescripcion('');
      setRoutePolygon([]);
    }
    setRouteModalVisible(true);
  };

  // Manejo de interacción geográfica en el mapa
  const handleAddMapPoint = (coord) => {
    if (!coord || !coord.latitude || !coord.longitude) return;
    setRoutePolygon((prev) => [
      ...prev,
      {
        latitude: parseFloat(coord.latitude),
        longitude: parseFloat(coord.longitude),
      },
    ]);
  };

  const handleClearPolygon = () => {
    setRoutePolygon([]);
  };

  const handleUndoPolygonPoint = () => {
    setRoutePolygon((prev) => prev.slice(0, -1));
  };

  const handleSaveRoute = async () => {
    if (!routeNombre.trim()) {
      Alert.alert('Campo requerido', 'Por favor ingresa el nombre de la ruta.');
      return;
    }

    setIsSavingRoute(true);
    try {
      const routePayload = {
        nombre: routeNombre,
        descripcion: routeDescripcion,
        geometria_ruta: routePolygon,
      };

      if (editingRoute) {
        await updateRoute(editingRoute.id, routePayload);
        Alert.alert('✅ Actualizado', 'La ruta y su delimitación geográfica fueron actualizadas.');
      } else {
        await createRoute(routePayload);
        Alert.alert('🎉 Ruta Creada', 'La nueva ruta y sus calles delimitadas han sido registradas en Supabase.');
      }
      setRouteModalVisible(false);
      await loadData();
    } catch (err) {
      console.error('[SupervisorHome] Error guardando ruta:', err);
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

        {/* Pestañas de Alternancia: Camiones vs Rutas vs Mapa */}
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
              🚛 Flota ({trucks.length})
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

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'mapa' && styles.tabButtonActive]}
            onPress={() => setActiveTab('mapa')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'mapa' && styles.tabButtonTextActive,
              ]}
            >
              🗺️ Dispersión ({geoCollections.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Botón de Agregar Nuevo Registro o Actualizar Mapa */}
      <View style={styles.actionHeaderBar}>
        <Text style={styles.sectionHeaderTitle}>
          {activeTab === 'camiones'
            ? 'Flota de Camiones Recolectores'
            : activeTab === 'rutas'
            ? 'Catálogo de Rutas Oficiales'
            : 'Dispersión Cartográfica de Recolecciones'}
        </Text>
        <TouchableOpacity
          style={[styles.addButton, activeTab === 'mapa' && styles.refreshMapButton]}
          onPress={() => {
            if (activeTab === 'camiones') {
              handleOpenTruckModal();
            } else if (activeTab === 'rutas') {
              handleOpenRouteModal();
            } else {
              loadData(true);
            }
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.addButtonText}>
            {activeTab === 'camiones'
              ? '+ Nuevo Camión'
              : activeTab === 'rutas'
              ? '+ Nueva Ruta'
              : '🔄 Actualizar GPS'}
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
      ) : activeTab === 'rutas' ? (
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
                  {Array.isArray(item.geometria_ruta) && item.geometria_ruta.length > 0 ? (
                    <View style={styles.routeGeoTag}>
                      <Text style={styles.routeGeoTagText}>
                        📐 {item.geometria_ruta.length} {item.geometria_ruta.length === 1 ? 'vértice' : 'calles/vértices trazados'}
                      </Text>
                    </View>
                  ) : null}
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
      ) : (
        /* 🗺️ VISTA CARTOGRÁFICA DE DISPERSIÓN GEOGRÁFICA */
        <ScrollView
          contentContainerStyle={styles.mapTabContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadData(true)}
              colors={[THEME.roles.supervisor]}
              tintColor={THEME.roles.supervisor}
            />
          }
        >
          {/* Panel de Estadísticas Territoriales */}
          <View style={styles.kpiContainer}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{geoCollections.length}</Text>
              <Text style={styles.kpiLabel}>Puntos GPS</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>
                {geoCollections
                  .reduce((acc, c) => acc + (parseFloat(c.peso_kg) || 0), 0)
                  .toFixed(1)}
              </Text>
              <Text style={styles.kpiLabel}>Kg Registrados</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{trucks.length}</Text>
              <Text style={styles.kpiLabel}>Camiones Activos</Text>
            </View>
          </View>

          {/* Tarjeta del Mapa */}
          <View style={styles.mapWrapperCard}>
            <View style={styles.mapCardHeader}>
              <View>
                <Text style={styles.mapCardBadge}>SUPABASE GEOSPATIAL • PALÍN</Text>
                <Text style={styles.mapCardTitle}>Dispersión de Recolecciones</Text>
              </View>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveBadgeText}>En Vivo</Text>
              </View>
            </View>
            <Text style={styles.mapCardSubtitle}>
              Puntos georreferenciados capturados por las cámaras y GPS de los operarios en campo.
            </Text>

            <EcoMap
              centerCoordinate={{
                latitude: selectedGeoPoint?.latitud || 14.4042,
                longitude: selectedGeoPoint?.longitud || -90.6978,
              }}
              markers={geoCollections.map((col, idx) => ({
                id: col.id || `col-${idx}`,
                latitude: col.latitud,
                longitude: col.longitud,
                title: `📦 ${col.material_tipo?.toUpperCase() || 'RECICLAJE'} (${col.peso_kg || 0} kg)`,
                description: `${col.usuarios?.nombre_completo || 'Cliente'} • ${col.usuarios?.direccion || 'Palín'}`,
                type: 'recoleccion',
              }))}
              height={320}
              zoomLevel={14}
              showUserLocation={false}
            />

            {/* Leyenda del Mapa */}
            <View style={styles.mapLegendRow}>
              <View style={styles.legendItem}>
                <Text style={styles.legendIcon}>📦</Text>
                <Text style={styles.legendText}>Punto de Recolección</Text>
              </View>
              <View style={styles.legendItem}>
                <Text style={styles.legendIcon}>📍</Text>
                <Text style={styles.legendText}>Cuadrante Municipal</Text>
              </View>
            </View>
          </View>

          {/* Detalle del Punto Seleccionado o Lista Reciente */}
          <View style={styles.collectionListSection}>
            <Text style={styles.collectionListTitle}>
              Registro de Puntos Georreferenciados ({geoCollections.length})
            </Text>
            <Text style={styles.collectionListSub}>
              Toca un punto para centrar el mapa o inspeccionar la coordenada capturada.
            </Text>

            {geoCollections.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>📍</Text>
                <Text style={styles.emptyTitle}>Sin puntos GPS registrados</Text>
                <Text style={styles.emptyDesc}>
                  Las recolecciones escaneadas con coordenadas aparecerán automáticamente en este mapa.
                </Text>
              </View>
            ) : (
              geoCollections.slice(0, 15).map((col, idx) => {
                const isSelected = selectedGeoPoint?.id === col.id;
                return (
                  <TouchableOpacity
                    key={col.id || idx}
                    style={[styles.geoItemCard, isSelected && styles.geoItemCardActive]}
                    onPress={() => setSelectedGeoPoint(col)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.geoItemTop}>
                      <View style={styles.geoMaterialBadge}>
                        <Text style={styles.geoMaterialText}>
                          📦 {col.material_tipo?.toUpperCase() || 'MATERIAL'}
                        </Text>
                      </View>
                      <Text style={styles.geoWeightText}>{col.peso_kg || 0} kg</Text>
                    </View>

                    <Text style={styles.geoClientName}>
                      {col.usuarios?.nombre_completo || 'Vecino de Palín'}
                    </Text>
                    <Text style={styles.geoClientAddress}>
                      {col.usuarios?.direccion || 'Sector Palín, Escuintla'}
                    </Text>

                    <View style={styles.geoMetaRow}>
                      <Text style={styles.geoCoordsText}>
                        🌐 Lat: {col.latitud?.toFixed(4)}, Lng: {col.longitud?.toFixed(4)}
                      </Text>
                      <Text style={styles.geoDateText}>
                        {col.fecha_hora
                          ? new Date(col.fecha_hora).toLocaleDateString()
                          : 'Reciente'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </ScrollView>
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

      {/* ─── MODAL RUTA CON SELECCIÓN GEOGRÁFICA ─────────────────────────────── */}
      <Modal visible={routeModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.routeModalCard]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
              <Text style={styles.modalTitle}>
                {editingRoute ? 'Editar Ruta' : 'Crear Nueva Ruta'}
              </Text>
              <Text style={styles.modalSubtitle}>
                Definición territorial y delimitación cartográfica para Palín.
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
                style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
                placeholder="Ej. Callejones 1 al 4, sector de la línea férrea..."
                value={routeDescripcion}
                onChangeText={setRouteDescripcion}
                multiline={true}
              />

              {/* SELECCIÓN GEOGRÁFICA DE LA RUTA EN PALÍN */}
              <View style={styles.geoSelectionBox}>
                <View style={styles.geoSelectionHeader}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.geoSelectionTitle}>🗺️ Delimitación de Calles (Palín)</Text>
                    <Text style={styles.geoSelectionSubtitle}>
                      Toca el mapa para fijar vértices y trazar el polígono de calles del sector.
                    </Text>
                  </View>
                  <View style={styles.polygonBadge}>
                    <Text style={styles.polygonBadgeText}>
                      {routePolygon.length} {routePolygon.length === 1 ? 'punto' : 'puntos'}
                    </Text>
                  </View>
                </View>

                {/* Mapa Interactivo para marcar puntos */}
                <EcoMap
                  centerCoordinate={{ latitude: 14.4042, longitude: -90.6978 }}
                  polygonCoordinates={routePolygon}
                  onMapPress={handleAddMapPoint}
                  height={220}
                  zoomLevel={15}
                />

                {/* Botones de Control de Geometría */}
                <View style={styles.geoControlsRow}>
                  <TouchableOpacity
                    style={[
                      styles.geoControlBtn,
                      routePolygon.length === 0 && styles.geoControlBtnDisabled,
                    ]}
                    onPress={handleUndoPolygonPoint}
                    disabled={routePolygon.length === 0}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.geoControlBtnText}>↩️ Deshacer</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.geoControlBtn,
                      styles.geoControlBtnClear,
                      routePolygon.length === 0 && styles.geoControlBtnDisabled,
                    ]}
                    onPress={handleClearPolygon}
                    disabled={routePolygon.length === 0}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.geoControlBtnText, styles.geoControlBtnClearText]}>
                      🗑️ Limpiar trazado
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

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
                    <Text style={styles.modalBtnSaveText}>Guardar Ruta</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
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
  refreshMapButton: {
    backgroundColor: '#0F172A',
  },
  mapTabContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    ...(Platform.OS === 'web' && {
      maxWidth: 1200,
      width: '100%',
      alignSelf: 'center',
    }),
  },
  kpiContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  mapWrapperCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
  },
  mapCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  mapCardBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6366F1',
    letterSpacing: 0.5,
  },
  mapCardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
    marginRight: 5,
  },
  liveBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
  },
  mapCardSubtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginBottom: 12,
    lineHeight: 16,
  },
  mapLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 8,
    marginTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  legendText: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
  },
  collectionListSection: {
    marginTop: 4,
  },
  collectionListTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  collectionListSub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
    marginBottom: 12,
  },
  geoItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  geoItemCardActive: {
    borderColor: '#6366F1',
    borderWidth: 1.5,
    backgroundColor: '#F5F3FF',
  },
  geoItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  geoMaterialBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  geoMaterialText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  geoWeightText: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  geoClientName: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  geoClientAddress: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  geoMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 8,
    paddingTop: 8,
  },
  geoCoordsText: {
    fontSize: 11,
    color: '#64748B',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  geoDateText: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
  },
  // Estilos de Selección Geográfica para Rutas
  routeModalCard: {
    maxHeight: '90%',
    paddingVertical: 14,
  },
  routeGeoTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  routeGeoTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  geoSelectionBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  geoSelectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  geoSelectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  geoSelectionSubtitle: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 1,
    lineHeight: 14,
  },
  polygonBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  polygonBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  geoControlsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  geoControlBtn: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  geoControlBtnClear: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  geoControlBtnDisabled: {
    opacity: 0.5,
  },
  geoControlBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  geoControlBtnClearText: {
    color: THEME.colors.danger,
  },
});
