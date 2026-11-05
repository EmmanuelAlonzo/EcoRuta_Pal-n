import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { THEME } from '../../constants/theme';
import {
  getPersonnelList,
  getTrucks,
  getRoutes,
  getCuadrillas,
  createCuadrilla,
  assignCuadrillaRoute,
  addMemberToCuadrilla,
  removeMemberFromCuadrilla,
  deleteCuadrilla,
  getCuadrillasSqlScript,
} from '../../api/logistics';

export default function SupervisorAssignScreen({ navigation }) {
  // Pestaña principal: 'asignacion' (Asignar Cuadrilla a Ruta) | 'cuadrillas' (Creación y Gestión de Cuadrillas)
  const [activeTab, setActiveTab] = useState('asignacion');

  // Estados de datos
  const [cuadrillas, setCuadrillas] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ─── ESTADOS DE ASIGNACIÓN (REQUERIMIENTO 2) ──────────────────────────────
  const [selectedCuadrillaId, setSelectedCuadrillaId] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [selectedTruckCode, setSelectedTruckCode] = useState('');
  const [isAssigningRoute, setIsAssigningRoute] = useState(false);

  // ─── ESTADOS PARA CREACIÓN DE CUADRILLA (REQUERIMIENTO 1) ─────────────────
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [cuadrillaNombre, setCuadrillaNombre] = useState('');
  const [cuadrillaDesc, setCuadrillaDesc] = useState('');
  const [cuadrillaCamion, setCuadrillaCamion] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [isSavingCuadrilla, setIsSavingCuadrilla] = useState(false);
  const [filterOnlyUnassigned, setFilterOnlyUnassigned] = useState(true);

  // ─── ESTADOS PARA AGREGAR MIEMBROS A CUADRILLA EXISTENTE (REQUERIMIENTO 3) 
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [isOperatingMember, setIsOperatingMember] = useState(false);

  // Modal para ver script SQL DDL
  const [sqlModalVisible, setSqlModalVisible] = useState(false);

  const loadData = useCallback(async (isPullToRefresh = false) => {
    if (isPullToRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const [cuadrillasData, staffData, trucksData, routesData] = await Promise.all([
        getCuadrillas(),
        getPersonnelList(),
        getTrucks(true), // Camiones activos
        getRoutes(),
      ]);

      // Filtrar únicamente personal operativo real activo (excluyendo cliente, afiliado, admin)
      const operationalStaff = (staffData || []).filter((p) => {
        const r = (p.rol || '').toLowerCase();
        return r !== 'cliente' && r !== 'afiliado' && r !== 'admin' && p.activo !== false;
      });

      setCuadrillas(cuadrillasData || []);
      setPersonnel(operationalStaff);
      setTrucks(trucksData || []);
      setRoutes(routesData || []);

      // Si no hay cuadrilla seleccionada, seleccionar la primera disponible
      if (!selectedCuadrillaId && cuadrillasData && cuadrillasData.length > 0) {
        setSelectedCuadrillaId(cuadrillasData[0].id);
        if (cuadrillasData[0].ruta_id) setSelectedRouteId(String(cuadrillasData[0].ruta_id));
        if (cuadrillasData[0].codigo_camion) setSelectedTruckCode(cuadrillasData[0].codigo_camion);
      }
    } catch (err) {
      console.error('[SupervisorAssign] Error cargando logística y cuadrillas:', err);
      Alert.alert('Error', 'No se pudieron consultar los datos de cuadrillas en Supabase.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedCuadrillaId]);

  useEffect(() => {
    loadData();
    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadData(true);
    });
    return unsubscribe;
  }, [navigation, loadData]);

  // Cuadrilla actualmente seleccionada en el dropdown
  const currentCuadrilla = cuadrillas.find((c) => String(c.id) === String(selectedCuadrillaId));

  // Al cambiar la cuadrilla seleccionada en el dropdown
  const handleSelectCuadrillaDropdown = (cuadId) => {
    setSelectedCuadrillaId(cuadId);
    const found = cuadrillas.find((c) => String(c.id) === String(cuadId));
    if (found) {
      setSelectedRouteId(found.ruta_id ? String(found.ruta_id) : '');
      setSelectedTruckCode(found.codigo_camion || '');
    }
  };

  // ─── ACCIÓN: ASIGNAR RUTA A LA CUADRILLA (REQUERIMIENTO 2) ────────────────
  const handleAssignRouteToCuadrilla = async () => {
    if (!selectedCuadrillaId) {
      Alert.alert('Selección Requerida', 'Por favor selecciona una cuadrilla del listado.');
      return;
    }
    if (!selectedRouteId) {
      Alert.alert('Selección Requerida', 'Debes seleccionar la ruta territorial a asignar.');
      return;
    }

    const targetRoute = routes.find((r) => String(r.id) === String(selectedRouteId));
    const targetRouteName = targetRoute ? targetRoute.nombre : 'Ruta Asignada';
    const targetCuadrilla = currentCuadrilla ? currentCuadrilla.nombre : 'Cuadrilla';
    const memberCount = currentCuadrilla?.miembros?.length || 0;

    Alert.alert(
      'Confirmar Asignación Colectiva',
      `¿Deseas asignar la ruta "${targetRouteName}" a la cuadrilla "${targetCuadrilla}"?${
        memberCount > 0
          ? `\n\nTodos los ${memberCount} colaboradores de la cuadrilla heredarán esta ruta automáticamente en su perfil.`
          : '\n\nNota: La cuadrilla aún no tiene operarios asignados.'
      }`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, Asignar Ruta',
          style: 'default',
          onPress: async () => {
            setIsAssigningRoute(true);
            try {
              await assignCuadrillaRoute(
                selectedCuadrillaId,
                selectedRouteId,
                targetRouteName,
                selectedTruckCode || null
              );

              await loadData(true);

              Alert.alert(
                '✅ Asignación Colectiva Exitosa',
                `La cuadrilla "${targetCuadrilla}" ahora tiene asignada la ruta "${targetRouteName}" en la tabla cuadrillas y perfiles.`
              );
            } catch (err) {
              console.error('[SupervisorAssign] Error asignando ruta a cuadrilla:', err);
              Alert.alert('Error al asignar', err.message || 'No se pudo guardar la asignación en Supabase.');
            } finally {
              setIsAssigningRoute(false);
            }
          },
        },
      ]
    );
  };

  // ─── ACCIÓN: CREAR NUEVA CUADRILLA CON MÚLTIPLES MIEMBROS (REQ 1) ─────────
  const handleOpenCreateCuadrilla = () => {
    setCuadrillaNombre('');
    setCuadrillaDesc('');
    setCuadrillaCamion('');
    setSelectedMemberIds([]);
    setFilterOnlyUnassigned(true);
    setIsCreateModalOpen(true);
  };

  const toggleMemberSelection = (userId) => {
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSaveNewCuadrilla = async () => {
    if (!cuadrillaNombre.trim()) {
      Alert.alert('Campo Requerido', 'Por favor ingresa un nombre para la cuadrilla.');
      return;
    }

    setIsSavingCuadrilla(true);
    try {
      const newCuad = await createCuadrilla({
        nombre: cuadrillaNombre.trim(),
        descripcion: cuadrillaDesc.trim(),
        codigo_camion: cuadrillaCamion || null,
        memberIds: selectedMemberIds,
      });

      await loadData(true);

      if (newCuad?.id) {
        setSelectedCuadrillaId(newCuad.id);
      }

      setIsCreateModalOpen(false);
      Alert.alert(
        '🎉 Cuadrilla Creada',
        `La cuadrilla "${cuadrillaNombre.trim()}" fue registrada con ${selectedMemberIds.length} operarios asignados.`
      );
    } catch (err) {
      console.error('[SupervisorAssign] Error creando cuadrilla:', err);
      Alert.alert('Error al crear cuadrilla', err.message || 'No se pudo registrar la cuadrilla.');
    } finally {
      setIsSavingCuadrilla(false);
    }
  };

  // ─── ACCIÓN: AGREGAR / QUITAR MIEMBROS RÁPIDAMENTE (REQUERIMIENTO 3) ──────
  const handleRemoveMember = (member) => {
    Alert.alert(
      'Quitar Operario',
      `¿Deseas remover a ${member.nombre_completo || 'este colaborador'} de la cuadrilla "${currentCuadrilla?.nombre}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, Remover',
          style: 'destructive',
          onPress: async () => {
            setIsOperatingMember(true);
            try {
              await removeMemberFromCuadrilla(member.id);
              await loadData(true);
              Alert.alert('Operario Removido', `${member.nombre_completo} ya no pertenece a esta cuadrilla.`);
            } catch (err) {
              Alert.alert('Error', err.message || 'No se pudo desvincular al colaborador.');
            } finally {
              setIsOperatingMember(false);
            }
          },
        },
      ]
    );
  };

  const handleAddMemberToCurrentCuadrilla = async (staff) => {
    if (!selectedCuadrillaId) return;

    setIsOperatingMember(true);
    try {
      const targetRoute = routes.find((r) => String(r.id) === String(currentCuadrilla?.ruta_id));
      await addMemberToCuadrilla(
        selectedCuadrillaId,
        staff.id,
        targetRoute ? targetRoute.nombre : null,
        currentCuadrilla?.codigo_camion || null
      );

      await loadData(true);
      setIsAddMemberModalOpen(false);

      Alert.alert(
        '✅ Miembro Agregado',
        `${staff.nombre_completo} ha sido incorporado a la cuadrilla "${currentCuadrilla?.nombre}".`
      );
    } catch (err) {
      Alert.alert('Error al agregar', err.message || 'No se pudo vincular al colaborador.');
    } finally {
      setIsOperatingMember(false);
    }
  };

  const handleDeleteCuadrillaAction = (cuad) => {
    Alert.alert(
      '⚠️ Eliminar Cuadrilla',
      `¿Estás seguro de eliminar la cuadrilla "${cuad.nombre}"?\n\nLos operarios vinculados quedarán sin cuadrilla asignada.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar Cuadrilla',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCuadrilla(cuad.id);
              await loadData(true);
              Alert.alert('Eliminado', 'La cuadrilla ha sido eliminada.');
            } catch (err) {
              Alert.alert('Error', err.message || 'No se pudo eliminar la cuadrilla.');
            }
          },
        },
      ]
    );
  };

  // Operarios operativos sin cuadrilla asignada (cuadrilla_id IS NULL)
  const unassignedPersonnel = personnel.filter(
    (p) => !p.cuadrilla_id || p.cuadrilla_id === null || p.cuadrilla_id === ''
  );

  // Lista para el checklist del modal Nueva Cuadrilla (de preferencia sin cuadrilla asignada)
  const modalStaffList = filterOnlyUnassigned ? unassignedPersonnel : personnel;

  // Operarios disponibles para agregar a la cuadrilla actual (que no están ya en ella)
  const availableStaffToAdd = personnel.filter(
    (p) => !currentCuadrilla?.miembros?.some((m) => String(m.id) === String(p.id))
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ─── ENCABEZADO SUPERIOR ────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.badgeTag}>
              <Text style={styles.badgeTagText}>🚛 ERP LOGÍSTICA & FLOTA</Text>
            </View>
            <Text style={styles.headerTitle}>Asignación de Rutas por Cuadrilla</Text>
            <Text style={styles.headerSubtitle}>
              Asigna rutas territoriales a cuadrillas completas en la tabla `cuadrillas`
            </Text>
          </View>
          <TouchableOpacity
            style={styles.sqlBtn}
            onPress={() => setSqlModalVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.sqlBtnText}>📄 SQL</Text>
          </TouchableOpacity>
        </View>

        {/* Selector de Pestaña Principal */}
        <View style={styles.tabNavRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'asignacion' && styles.tabBtnActive]}
            onPress={() => setActiveTab('asignacion')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'asignacion' && styles.tabBtnTextActive]}>
              🗺️ Asignar Ruta a Cuadrilla
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'cuadrillas' && styles.tabBtnActive]}
            onPress={() => setActiveTab('cuadrillas')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'cuadrillas' && styles.tabBtnTextActive]}>
              👥 Gestión de Cuadrillas ({cuadrillas.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={THEME.roles.supervisor} />
          <Text style={styles.loadingText}>Cargando cuadrillas, flota y rutas en Palín...</Text>
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
          {/* ═══════════════════════════════════════════════════════════════════
              VISTA 1: ASIGNACIÓN DE RUTA POR CUADRILLA (REQUERIMIENTO 2)
             ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'asignacion' && (
            <View>
              {/* PASO 1: DROPDOWN / SELECTOR DE CUADRILLA */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionStepTag}>PASO 1</Text>
                    <Text style={styles.sectionTitle}>Selecciona la Cuadrilla Operativa</Text>
                    <Text style={styles.sectionDesc}>
                      Elige el equipo de trabajo al que se le asignará la ruta en Supabase:
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.newCuadQuickBtn}
                    onPress={handleOpenCreateCuadrilla}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.newCuadQuickBtnText}>✨ Nueva</Text>
                  </TouchableOpacity>
                </View>

                {cuadrillas.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyIcon}>👥</Text>
                    <Text style={styles.emptyTitle}>Aún no hay cuadrillas registradas</Text>
                    <TouchableOpacity
                      style={styles.createFirstCuadBtn}
                      onPress={handleOpenCreateCuadrilla}
                    >
                      <Text style={styles.createFirstCuadBtnText}>+ Crear la Primera Cuadrilla</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cuadrillasDropdownRow}>
                    {cuadrillas.map((cuad) => {
                      const isSelected = String(selectedCuadrillaId) === String(cuad.id);
                      return (
                        <TouchableOpacity
                          key={cuad.id?.toString()}
                          style={[styles.cuadChipCard, isSelected && styles.cuadChipCardSelected]}
                          onPress={() => handleSelectCuadrillaDropdown(cuad.id)}
                          activeOpacity={0.8}
                        >
                          <View style={styles.cuadChipTop}>
                            <Text style={styles.cuadChipIcon}>👥</Text>
                            <View style={[styles.cuadMemberBadge, isSelected && styles.cuadMemberBadgeSelected]}>
                              <Text style={[styles.cuadMemberBadgeText, isSelected && styles.cuadMemberBadgeTextSelected]}>
                                {cuad.miembros?.length || cuad.total_miembros || 0} operarios
                              </Text>
                            </View>
                          </View>
                          <Text style={[styles.cuadChipName, isSelected && styles.cuadChipNameSelected]} numberOfLines={1}>
                            {cuad.nombre}
                          </Text>
                          <Text style={styles.cuadChipSub} numberOfLines={1}>
                            📍 {cuad.ruta_nombre || 'Sin ruta fijada'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>

              {/* LISTA DE MIEMBROS DE LA CUADRILLA SELECCIONADA (REQUERIMIENTO 3) */}
              {Boolean(currentCuadrilla) && (
                <View style={styles.membersManagerCard}>
                  <View style={styles.membersManagerHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.membersManagerTitle}>
                        👥 Miembros de "{currentCuadrilla.nombre}" ({currentCuadrilla.miembros?.length || 0})
                      </Text>
                      <Text style={styles.membersManagerSub}>
                        Agrega o retira operarios rápidamente de esta cuadrilla:
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.addMemberBtn}
                      onPress={() => setIsAddMemberModalOpen(true)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.addMemberBtnText}>➕ Agregar Operario</Text>
                    </TouchableOpacity>
                  </View>

                  {(!currentCuadrilla.miembros || currentCuadrilla.miembros.length === 0) ? (
                    <View style={styles.emptyMembersBox}>
                      <Text style={styles.emptyMembersText}>
                        Esta cuadrilla no tiene operarios asignados. Toca "➕ Agregar Operario" para asignarle personal.
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.membersListGrid}>
                      {currentCuadrilla.miembros.map((m) => {
                        const isPiloto = m.rol === 'piloto';
                        return (
                          <View key={m.id?.toString()} style={styles.memberCard}>
                            <View style={styles.memberAvatar}>
                              <Text style={styles.memberAvatarText}>{isPiloto ? '🧑‍✈️' : '🚛'}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.memberName}>{m.nombre_completo || 'Colaborador'}</Text>
                              <Text style={styles.memberSub}>
                                {isPiloto ? 'Piloto Unidad' : 'Operario Recolección'} • {m.telefono || 'Sin tel'}
                              </Text>
                            </View>
                            <TouchableOpacity
                              style={styles.removeMemberBtn}
                              onPress={() => handleRemoveMember(m)}
                              disabled={isOperatingMember}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.removeMemberBtnText}>✕ Quitar</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              {/* PASO 2: SELECCIONAR RUTA TERRITORIAL (ruta_id) */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionStepTag}>PASO 2</Text>
                <Text style={styles.sectionTitle}>Selecciona la Ruta Territorial (ruta_id)</Text>
                <Text style={styles.sectionDesc}>
                  Sectores de recolección disponibles en la tabla `rutas`:
                </Text>

                <View style={styles.routesList}>
                  {routes.length === 0 ? (
                    <View style={styles.emptyCard}>
                      <Text style={styles.emptyText}>No hay rutas registradas en la tabla `rutas`.</Text>
                    </View>
                  ) : (
                    routes.map((r) => {
                      const isSelected = String(selectedRouteId) === String(r.id);
                      return (
                        <TouchableOpacity
                          key={r.id?.toString()}
                          style={[styles.routeSelectCard, isSelected && styles.routeSelectCardSelected]}
                          onPress={() => setSelectedRouteId(String(r.id))}
                          activeOpacity={0.8}
                        >
                          <View style={styles.routeIconCircle}>
                            <Text style={styles.routeIcon}>📍</Text>
                          </View>
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

              {/* PASO 3: SELECCIONAR CAMIÓN DE FLOTA (OPCIONAL) */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionStepTag}>PASO 3 (OPCIONAL)</Text>
                <Text style={styles.sectionTitle}>Unidad de Camión Asignada</Text>
                <Text style={styles.sectionDesc}>Camiones de la flota disponibles:</Text>

                <View style={styles.trucksRow}>
                  {trucks.map((t) => {
                    const isSelected = selectedTruckCode === t.codigo;
                    return (
                      <TouchableOpacity
                        key={t.id?.toString()}
                        style={[styles.truckChip, isSelected && styles.truckChipSelected]}
                        onPress={() => setSelectedTruckCode(isSelected ? '' : t.codigo)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.truckChipIcon}>🚛</Text>
                        <Text style={[styles.truckChipText, isSelected && styles.truckChipTextSelected]}>
                          {t.codigo}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* RESUMEN Y BOTÓN DE ASIGNACIÓN COLECTIVA */}
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>📌 Resumen de Asignación por Cuadrilla</Text>
                <View style={styles.summaryDetails}>
                  <Text style={styles.summaryLine}>
                    • Cuadrilla: <Text style={styles.summaryBold}>{currentCuadrilla?.nombre || 'Ninguna seleccionada'}</Text>
                  </Text>
                  <Text style={styles.summaryLine}>
                    • Operarios beneficiados: <Text style={styles.summaryBold}>{currentCuadrilla?.miembros?.length || 0} colaboradores</Text>
                  </Text>
                  <Text style={styles.summaryLine}>
                    • Ruta Destino: <Text style={styles.summaryBold}>
                      {routes.find((r) => String(r.id) === String(selectedRouteId))?.nombre || 'Ninguna'}
                    </Text>
                  </Text>
                  <Text style={styles.summaryLine}>
                    • Unidad Camión: <Text style={styles.summaryBold}>{selectedTruckCode || 'Sin camión específico'}</Text>
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.assignActionBtn,
                    (!selectedCuadrillaId || !selectedRouteId || isAssigningRoute) && styles.assignActionBtnDisabled,
                  ]}
                  onPress={handleAssignRouteToCuadrilla}
                  disabled={!selectedCuadrillaId || !selectedRouteId || isAssigningRoute}
                  activeOpacity={0.85}
                >
                  {isAssigningRoute ? (
                    <View style={styles.btnLoadingRow}>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.assignActionBtnText}> Asignando en Supabase...</Text>
                    </View>
                  ) : (
                    <Text style={styles.assignActionBtnText}>
                      🚀 Asignar Ruta a la Cuadrilla Completa
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              VISTA 2: GESTIÓN Y LISTA DE CUADRILLAS (REQUERIMIENTO 1)
             ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'cuadrillas' && (
            <View>
              <View style={styles.cuadHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cuadHeaderTitle}>Nómina de Cuadrillas Oficiales</Text>
                  <Text style={styles.cuadHeaderSub}>
                    Equipos de recolección en la tabla `cuadrillas` y sus miembros vinculados en `perfiles`
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.createCuadBtn}
                  onPress={handleOpenCreateCuadrilla}
                  activeOpacity={0.85}
                >
                  <Text style={styles.createCuadBtnText}>✨ Nueva Cuadrilla</Text>
                </TouchableOpacity>
              </View>

              {cuadrillas.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyIcon}>👥</Text>
                  <Text style={styles.emptyTitle}>Sin cuadrillas registradas</Text>
                  <Text style={styles.emptyDesc}>Crea una cuadrilla para organizar los turnos en Palín.</Text>
                </View>
              ) : (
                cuadrillas.map((c) => (
                  <View key={c.id?.toString()} style={styles.cuadManageCard}>
                    <View style={styles.cuadManageTop}>
                      <View style={{ flex: 1 }}>
                        <View style={styles.cuadNameRow}>
                          <Text style={styles.cuadManageTitle}>{c.nombre}</Text>
                          <View style={styles.activeTag}>
                            <Text style={styles.activeTagText}>Activa</Text>
                          </View>
                        </View>
                        <Text style={styles.cuadManageDesc}>{c.descripcion || 'Sin descripción'}</Text>
                      </View>

                      <TouchableOpacity
                        style={styles.deleteCuadBtn}
                        onPress={() => handleDeleteCuadrillaAction(c)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.deleteCuadBtnText}>🗑️</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Resumen de Asignación de la Cuadrilla */}
                    <View style={styles.cuadAssignmentDetails}>
                      <Text style={styles.cuadAssignmentText}>
                        📍 Ruta Asignada: <Text style={styles.boldText}>{c.ruta_nombre || 'Sin ruta asignada'}</Text>
                      </Text>
                      <Text style={styles.cuadAssignmentText}>
                        🚛 Camión Asignado: <Text style={styles.boldText}>{c.codigo_camion || 'Sin asignar'}</Text>
                      </Text>
                      <Text style={styles.cuadAssignmentText}>
                        👥 Colaboradores Asignados: <Text style={[styles.boldText, { color: THEME.roles.supervisor }]}>
                          {c.miembros?.length || 0} miembros
                        </Text>
                      </Text>
                    </View>

                    {/* Chips de Miembros Asignados */}
                    {c.miembros && c.miembros.length > 0 && (
                      <View style={styles.memberChipsContainer}>
                        {c.miembros.map((m) => (
                          <View key={m.id?.toString()} style={styles.memberChip}>
                            <Text style={styles.memberChipIcon}>
                              {m.rol === 'piloto' ? '🧑‍✈️' : '🚛'}
                            </Text>
                            <Text style={styles.memberChipText} numberOfLines={1}>
                              {m.nombre_completo}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Botón de Asignación Directa */}
                    <TouchableOpacity
                      style={styles.cuadSelectForAssignBtn}
                      onPress={() => {
                        setSelectedCuadrillaId(c.id);
                        if (c.ruta_id) setSelectedRouteId(String(c.ruta_id));
                        if (c.codigo_camion) setSelectedTruckCode(c.codigo_camion);
                        setActiveTab('asignacion');
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.cuadSelectForAssignBtnText}>
                        🗺️ Asignar o Cambiar Ruta a esta Cuadrilla →
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* ─── MODAL CREACIÓN DE CUADRILLA CON SELECCIÓN MÚLTIPLE (REQ 1) ───── */}
      <Modal visible={isCreateModalOpen} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTag}>MÓDULO DE LOGÍSTICA</Text>
                <Text style={styles.modalTitle}>Crear Nueva Cuadrilla</Text>
                <Text style={styles.modalSub}>
                  Registra la cuadrilla y asigna múltiples operarios en `perfiles`
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsCreateModalOpen(false)}
                disabled={isSavingCuadrilla}
              >
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '80%' }}>
              <Text style={styles.inputLabel}>Nombre de la Cuadrilla *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ej. Cuadrilla Norte - Casco Urbano"
                placeholderTextColor="#94A3B8"
                value={cuadrillaNombre}
                onChangeText={setCuadrillaNombre}
              />

              <Text style={styles.inputLabel}>Descripción Operativa</Text>
              <TextInput
                style={[styles.textInput, { height: 60 }]}
                placeholder="Turno, sector o funciones de la cuadrilla..."
                placeholderTextColor="#94A3B8"
                value={cuadrillaDesc}
                onChangeText={setCuadrillaDesc}
                multiline
              />

              <Text style={styles.inputLabel}>Camión de Flota Asignado (Opcional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.truckSelectChipsRow}>
                {trucks.map((t) => {
                  const isSel = cuadrillaCamion === t.codigo;
                  return (
                    <TouchableOpacity
                      key={t.id?.toString()}
                      style={[styles.truckSelectChip, isSel && styles.truckSelectChipActive]}
                      onPress={() => setCuadrillaCamion(isSel ? '' : t.codigo)}
                    >
                      <Text style={[styles.truckSelectChipText, isSel && styles.truckSelectChipTextActive]}>
                        🚛 {t.codigo}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* SELECCIÓN MÚLTIPLE DE OPERARIOS (REQUERIMIENTO 1 & 2) */}
              <View style={styles.staffSelectionBox}>
                <View style={styles.staffSelectionHeader}>
                  <Text style={styles.staffSelectionTitle}>
                    Asignar Operarios y Pilotos ({selectedMemberIds.length} seleccionados)
                  </Text>
                  <Text style={styles.staffSelectionSub}>
                    Personal operativo obtenido de `perfiles`. Se actualizará su `cuadrilla_id`.
                  </Text>
                </View>

                {/* Filtro: Priorizar personal sin cuadrilla asignada (cuadrilla_id IS NULL) */}
                <View style={styles.filterToggleRow}>
                  <TouchableOpacity
                    style={[styles.filterToggleBtn, filterOnlyUnassigned && styles.filterToggleBtnActive]}
                    onPress={() => setFilterOnlyUnassigned(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.filterToggleBtnText, filterOnlyUnassigned && styles.filterToggleBtnTextActive]}>
                      🟢 Sin Cuadrilla ({unassignedPersonnel.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.filterToggleBtn, !filterOnlyUnassigned && styles.filterToggleBtnActive]}
                    onPress={() => setFilterOnlyUnassigned(false)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.filterToggleBtnText, !filterOnlyUnassigned && styles.filterToggleBtnTextActive]}>
                      👥 Todos ({personnel.length})
                    </Text>
                  </TouchableOpacity>
                </View>

                {modalStaffList.length === 0 ? (
                  <View style={styles.emptyCardSmall}>
                    <Text style={styles.emptyIconSmall}>ℹ️</Text>
                    <Text style={styles.emptyTextSmallBold}>
                      {filterOnlyUnassigned
                        ? 'No hay operarios activos sin cuadrilla actualmente.'
                        : 'No hay operarios registrados en la tabla perfiles.'}
                    </Text>
                    {filterOnlyUnassigned && personnel.length > 0 && (
                      <TouchableOpacity
                        style={styles.seeAllStaffBtn}
                        onPress={() => setFilterOnlyUnassigned(false)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.seeAllStaffBtnText}>
                          Ver todos ({personnel.length}) para reasignar operarios
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  <View style={styles.staffMultiCheckList}>
                    {modalStaffList.map((p) => {
                      const isChecked = selectedMemberIds.includes(p.id);
                      const isPiloto = (p.rol || '').toLowerCase() === 'piloto';
                      const isUnassigned = !p.cuadrilla_id || p.cuadrilla_id === null || p.cuadrilla_id === '';
                      const existingCuad = !isUnassigned
                        ? cuadrillas.find((c) => String(c.id) === String(p.cuadrilla_id))?.nombre
                        : null;

                      return (
                        <TouchableOpacity
                          key={p.id?.toString()}
                          style={[styles.staffCheckItem, isChecked && styles.staffCheckItemActive]}
                          onPress={() => toggleMemberSelection(p.id)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.checkboxSquare, isChecked && styles.checkboxSquareChecked]}>
                            {isChecked && <Text style={styles.checkSquareIcon}>✓</Text>}
                          </View>
                          <Text style={styles.staffEmoji}>{isPiloto ? '🧑‍✈️' : '🚛'}</Text>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Text style={[styles.staffCheckName, isChecked && styles.staffCheckNameActive]} numberOfLines={1}>
                                {p.nombre_completo || 'Colaborador'}
                              </Text>
                              {isUnassigned ? (
                                <View style={styles.unassignedBadge}>
                                  <Text style={styles.unassignedBadgeText}>🟢 Libre</Text>
                                </View>
                              ) : (
                                <View style={styles.assignedBadge}>
                                  <Text style={styles.assignedBadgeText} numberOfLines={1}>
                                    {existingCuad || 'Asignado'}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.staffCheckSub}>
                              {p.rol ? p.rol.toUpperCase() : 'OPERARIO'} • Tel: {p.telefono || 'Sin teléfono'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              <View style={styles.modalActionsRow}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setIsCreateModalOpen(false)}
                  disabled={isSavingCuadrilla}
                >
                  <Text style={styles.modalCancelBtnText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalSaveBtn, isSavingCuadrilla && styles.modalSaveBtnDisabled]}
                  onPress={handleSaveNewCuadrilla}
                  disabled={isSavingCuadrilla}
                >
                  {isSavingCuadrilla ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalSaveBtnText}>✨ Guardar Cuadrilla</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL AGREGAR MIEMBRO A CUADRILLA EXISTENTE (REQ 3) ──────────── */}
      <Modal visible={isAddMemberModalOpen} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTag}>CUADRILLA ACTIVA</Text>
                <Text style={styles.modalTitle}>Agregar Colaborador</Text>
                <Text style={styles.modalSub}>
                  Incorpora un operario a "{currentCuadrilla?.nombre}"
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsAddMemberModalOpen(false)}
              >
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
              {availableStaffToAdd.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No hay más colaboradores disponibles</Text>
                  <Text style={styles.emptyDesc}>
                    Todos los operarios activos ya están asignados a esta cuadrilla.
                  </Text>
                </View>
              ) : (
                availableStaffToAdd.map((staff) => {
                  const isPiloto = (staff.rol || '').toLowerCase() === 'piloto';
                  const isUnassigned = !staff.cuadrilla_id || staff.cuadrilla_id === null || staff.cuadrilla_id === '';
                  const existingCuad = !isUnassigned
                    ? cuadrillas.find((c) => String(c.id) === String(staff.cuadrilla_id))?.nombre
                    : null;
                  return (
                    <View key={staff.id?.toString()} style={styles.addMemberRowCard}>
                      <View style={styles.memberAvatar}>
                        <Text style={styles.memberAvatarText}>{isPiloto ? '🧑‍✈️' : '🚛'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memberName}>{staff.nombre_completo}</Text>
                        <Text style={styles.memberSub}>
                          {isPiloto ? 'Piloto Oficial' : 'Operario'} • {isUnassigned ? '🟢 Sin cuadrilla' : `⚠️ En: ${existingCuad || 'Otra cuadrilla'}`}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.confirmAddBtn}
                        onPress={() => handleAddMemberToCurrentCuadrilla(staff)}
                        disabled={isOperatingMember}
                      >
                        <Text style={styles.confirmAddBtnText}>+ Agregar</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalCloseFullBtn}
              onPress={() => setIsAddMemberModalOpen(false)}
            >
              <Text style={styles.modalCloseFullBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL ASISTENCIA SQL DDL SUPABASE ───────────────────────────── */}
      <Modal visible={sqlModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTag}>ESQUEMA POSTGRESQL</Text>
                <Text style={styles.modalTitle}>Script DDL para `cuadrillas`</Text>
                <Text style={styles.modalSub}>
                  Tabla cuadrillas y columna cuadrilla_id en perfiles
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setSqlModalVisible(false)}
              >
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.sqlCodeBox} showsVerticalScrollIndicator={true}>
              <Text style={styles.sqlCodeText}>{getCuadrillasSqlScript()}</Text>
            </ScrollView>

            <TouchableOpacity
              style={styles.modalCloseFullBtn}
              onPress={() => setSqlModalVisible(false)}
            >
              <Text style={styles.modalCloseFullBtnText}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    ...(Platform.OS === 'web' && {
      maxWidth: 1100,
      width: '100%',
      alignSelf: 'center',
    }),
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  badgeTag: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  badgeTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  sqlBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sqlBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  tabNavRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginTop: 10,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabBtnTextActive: {
    color: THEME.roles.supervisor,
    fontWeight: '800',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    ...(Platform.OS === 'web' && {
      maxWidth: 1100,
      width: '100%',
      alignSelf: 'center',
    }),
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  sectionStepTag: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.roles.supervisor,
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 1,
  },
  sectionDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 10,
  },
  newCuadQuickBtn: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  newCuadQuickBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  cuadrillasDropdownRow: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  cuadChipCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginRight: 10,
    minWidth: 160,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  cuadChipCardSelected: {
    backgroundColor: '#FFFBEB',
    borderColor: THEME.roles.supervisor,
  },
  cuadChipTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cuadChipIcon: {
    fontSize: 16,
  },
  cuadMemberBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cuadMemberBadgeSelected: {
    backgroundColor: '#FEF3C7',
  },
  cuadMemberBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#475569',
  },
  cuadMemberBadgeTextSelected: {
    color: '#B45309',
  },
  cuadChipName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  cuadChipNameSelected: {
    color: '#B45309',
    fontWeight: '800',
  },
  cuadChipSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },

  // Panel Miembros de la Cuadrilla Seleccionada
  membersManagerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  membersManagerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  membersManagerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  membersManagerSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  addMemberBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addMemberBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyMembersBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  emptyMembersText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  membersListGrid: {
    gap: 8,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  memberAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    fontSize: 16,
  },
  memberName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  memberSub: {
    fontSize: 11,
    color: '#64748B',
  },
  removeMemberBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
  },
  removeMemberBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B91C1C',
  },

  // Paso 2: Rutas
  routesList: {
    gap: 8,
  },
  routeSelectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  routeSelectCardSelected: {
    backgroundColor: '#FFFBEB',
    borderColor: THEME.roles.supervisor,
  },
  routeIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeIcon: {
    fontSize: 14,
  },
  routeSelectName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  routeSelectNameSelected: {
    color: '#B45309',
    fontWeight: '800',
  },
  routeSelectDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  radioDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
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

  // Paso 3: Camiones
  trucksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  truckChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 6,
  },
  truckChipSelected: {
    backgroundColor: '#FFFBEB',
    borderColor: THEME.roles.supervisor,
  },
  truckChipIcon: {
    fontSize: 14,
  },
  truckChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  truckChipTextSelected: {
    color: '#B45309',
    fontWeight: '800',
  },

  // Resumen
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  summaryDetails: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    gap: 4,
    marginBottom: 14,
  },
  summaryLine: {
    fontSize: 12,
    color: '#475569',
  },
  summaryBold: {
    fontWeight: '700',
    color: '#0F172A',
  },
  assignActionBtn: {
    backgroundColor: THEME.roles.supervisor,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  assignActionBtnDisabled: {
    opacity: 0.6,
  },
  assignActionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  btnLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Vista 2: Gestión de Cuadrillas
  cuadHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cuadHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  cuadHeaderSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  createCuadBtn: {
    backgroundColor: THEME.roles.supervisor,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  createCuadBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  cuadManageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cuadManageTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cuadNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cuadManageTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  activeTag: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activeTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#15803D',
  },
  cuadManageDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  deleteCuadBtn: {
    padding: 6,
  },
  deleteCuadBtnText: {
    fontSize: 14,
  },
  cuadAssignmentDetails: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginVertical: 8,
    gap: 3,
  },
  cuadAssignmentText: {
    fontSize: 11,
    color: '#64748B',
  },
  boldText: {
    fontWeight: '700',
    color: '#0F172A',
  },
  memberChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  memberChipIcon: {
    fontSize: 11,
  },
  memberChipText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
  cuadSelectForAssignBtn: {
    paddingVertical: 6,
    alignItems: 'flex-end',
  },
  cuadSelectForAssignBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.roles.supervisor,
  },

  // Modales
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCardLarge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  modalTag: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.roles.supervisor,
    letterSpacing: 0.5,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  modalSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalCloseBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#94A3B8',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
    marginTop: 8,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
  },
  truckSelectChipsRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    marginBottom: 6,
  },
  truckSelectChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginRight: 6,
  },
  truckSelectChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: THEME.roles.supervisor,
  },
  truckSelectChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  truckSelectChipTextActive: {
    color: '#B45309',
    fontWeight: '800',
  },
  staffSelectionBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  staffSelectionHeader: {
    marginBottom: 8,
  },
  staffSelectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  staffSelectionSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  staffMultiCheckList: {
    gap: 6,
  },
  staffCheckItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  staffCheckItemActive: {
    backgroundColor: '#FFFBEB',
    borderColor: THEME.roles.supervisor,
  },
  checkboxSquare: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxSquareChecked: {
    backgroundColor: THEME.roles.supervisor,
    borderColor: THEME.roles.supervisor,
  },
  checkSquareIcon: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  staffEmoji: {
    fontSize: 14,
  },
  staffCheckName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  staffCheckNameActive: {
    color: '#B45309',
    fontWeight: '800',
  },
  staffCheckSub: {
    fontSize: 10,
    color: '#64748B',
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    alignItems: 'center',
  },
  modalCancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  modalSaveBtn: {
    flex: 1.5,
    paddingVertical: 10,
    backgroundColor: THEME.roles.supervisor,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalSaveBtnDisabled: {
    opacity: 0.7,
  },
  modalSaveBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  addMemberRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    gap: 10,
  },
  confirmAddBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  confirmAddBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  modalCloseFullBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  modalCloseFullBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  emptyCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptyDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
  },
  createFirstCuadBtn: {
    backgroundColor: THEME.roles.supervisor,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
  },
  createFirstCuadBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  emptyTextSmall: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    padding: 8,
  },
  sqlCodeBox: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 10,
    marginVertical: 10,
    maxHeight: 300,
  },
  sqlCodeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: '#38BDF8',
    lineHeight: 16,
  },
  filterToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
    gap: 6,
  },
  filterToggleBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 8,
  },
  filterToggleBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  filterToggleBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  filterToggleBtnTextActive: {
    color: THEME.roles.supervisor,
    fontWeight: '800',
  },
  unassignedBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  unassignedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  assignedBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: 130,
  },
  assignedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  emptyCardSmall: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginVertical: 8,
  },
  emptyIconSmall: {
    fontSize: 22,
    marginBottom: 4,
  },
  emptyTextSmallBold: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
  },
  seeAllStaffBtn: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 6,
  },
  seeAllStaffBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
});
