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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { THEME } from '../../constants/theme';
import { ROLES, ROLE_LABELS } from '../../constants/roles';
import {
  getPersonnelList,
  updatePersonnel,
  togglePersonnelStatus,
  deletePersonnel,
} from '../../api/logistics';

export default function AdminPersonnelScreen({ navigation }) {
  const [personnel, setPersonnel] = useState([]);
  const [filterRole, setFilterRole] = useState('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Estado para Modal de Edición
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [editNombre, setEditNombre] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editRol, setEditRol] = useState('operario');
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(async (isPullToRefresh = false) => {
    if (isPullToRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const data = await getPersonnelList();
      setPersonnel(data || []);
    } catch (err) {
      console.error('[AdminPersonnel] Error cargando personal:', err);
      Alert.alert('Error', 'No se pudo cargar la lista de colaboradores desde Supabase.');
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

  // ─── ACCIÓN: SUSPENDER / ACTIVAR COLABORADOR ──────────────────────────────
  const handleToggleStatus = (item) => {
    const isCurrentlyActive = item.activo !== false;
    const nextState = !isCurrentlyActive;
    const actionWord = nextState ? 'Activar' : 'Suspender';

    Alert.alert(
      `Confirmar ${actionWord}`,
      `¿Deseas ${actionWord.toLowerCase()} el acceso de ${item.nombre_completo || 'este colaborador'} al sistema EcoRuta?${
        !nextState ? '\n\nEl usuario no podrá iniciar sesión en la aplicación.' : ''
      }`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: `Sí, ${actionWord}`,
          style: nextState ? 'default' : 'destructive',
          onPress: async () => {
            try {
              await togglePersonnelStatus(item.id, nextState);
              await loadData();
              Alert.alert(
                'Estado actualizado',
                `El colaborador ahora se encuentra ${nextState ? 'Activo' : 'Suspendido'}.`
              );
            } catch (err) {
              Alert.alert('Error', err.message || 'No se pudo cambiar el estado.');
            }
          },
        },
      ]
    );
  };

  // ─── ACCIÓN: ELIMINAR COLABORADOR ─────────────────────────────────────────
  const handleDelete = (item) => {
    Alert.alert(
      '⚠️ Eliminar Colaborador',
      `¿Estás seguro de eliminar el perfil de ${item.nombre_completo || 'este colaborador'}?\n\nEsta acción quitará el rol del personal municipal.`,
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: 'Eliminar Definitivamente',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePersonnel(item.id);
              await loadData();
              Alert.alert('Eliminado', 'El colaborador ha sido removido del sistema.');
            } catch (err) {
              Alert.alert('Error al eliminar', err.message || 'No se pudo eliminar el registro.');
            }
          },
        },
      ]
    );
  };

  // ─── ACCIÓN: ABRIR MODAL DE EDICIÓN ───────────────────────────────────────
  const handleOpenEdit = (item) => {
    setSelectedUser(item);
    setEditNombre(item.nombre_completo || '');
    setEditTelefono(item.telefono || '');
    setEditRol(item.rol || 'operario');
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editNombre.trim()) {
      Alert.alert('Campo requerido', 'Por favor ingresa el nombre completo del colaborador.');
      return;
    }

    setIsSaving(true);
    try {
      await updatePersonnel(selectedUser.id, {
        nombre_completo: editNombre,
        telefono: editTelefono,
        rol: editRol,
      });

      setEditModalVisible(false);
      setSelectedUser(null);
      await loadData();
      Alert.alert('✅ Cambios Guardados', 'Los datos del colaborador se actualizaron exitosamente.');
    } catch (err) {
      console.error('[AdminPersonnel] Error guardando edición:', err);
      Alert.alert('Error al guardar', err.message || 'No se pudieron guardar los cambios en Supabase.');
    } finally {
      setIsSaving(false);
    }
  };

  // Filtrado reactivo en memoria
  const filteredPersonnel = personnel.filter((p) => {
    const matchesRole = filterRole === 'todos' || p.rol === filterRole;
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      (p.nombre_completo && p.nombre_completo.toLowerCase().includes(query)) ||
      (p.email && p.email.toLowerCase().includes(query)) ||
      (p.codigo_camion && p.codigo_camion.toLowerCase().includes(query));
    return matchesRole && matchesSearch;
  });

  const countActivos = personnel.filter((p) => p.activo !== false).length;
  const countSuspendidos = personnel.filter((p) => p.activo === false).length;

  const getRoleBadgeStyle = (rol) => {
    if (rol === 'supervisor') return { bg: '#FEF3C7', text: '#B45309', border: '#FDE68A', label: 'Supervisor' };
    if (rol === 'piloto') return { bg: '#E0F2FE', text: '#0369A1', border: '#BAE6FD', label: 'Piloto' };
    return { bg: '#DBEAFE', text: '#1E40AF', border: '#BFDBFE', label: 'Operario' };
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerContainer}>
        <View style={styles.headerTopRow}>
          <View>
            <Text style={styles.title}>👥 Gestión de Personal</Text>
            <Text style={styles.subtitle}>
              Municipalidad de Palín • Operarios, Pilotos y Supervisores
            </Text>
          </View>
        </View>

        {/* Barra de Estadísticas Rápidas */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{personnel.length}</Text>
            <Text style={styles.statLabel}>Registrados</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, { color: '#059669' }]}>{countActivos}</Text>
            <Text style={styles.statLabel}>Activos</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, { color: countSuspendidos > 0 ? '#DC2626' : '#64748B' }]}>
              {countSuspendidos}
            </Text>
            <Text style={styles.statLabel}>Suspendidos</Text>
          </View>
        </View>

        {/* Buscador */}
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Buscar por nombre, correo o camión..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        {/* Filtros por Rol */}
        <View style={styles.filtersRow}>
          {[
            { key: 'todos', label: 'Todos' },
            { key: 'operario', label: '🚛 Operarios' },
            { key: 'piloto', label: '🧑‍✈️ Pilotos' },
            { key: 'supervisor', label: '📋 Supervisores' },
          ].map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, filterRole === f.key && styles.filterChipActive]}
              onPress={() => setFilterRole(f.key)}
            >
              <Text style={[styles.filterChipText, filterRole === f.key && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={THEME.roles.admin} />
          <Text style={styles.loadingText}>Consultando nómina de colaboradores...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPersonnel}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadData(true)}
              colors={[THEME.roles.admin]}
              tintColor={THEME.roles.admin}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>👤</Text>
              <Text style={styles.emptyTitle}>No se encontraron colaboradores</Text>
              <Text style={styles.emptyDesc}>
                {searchQuery
                  ? 'Intenta con otro término de búsqueda.'
                  : 'Aún no hay personal registrado con el rol seleccionado.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const roleBadge = getRoleBadgeStyle(item.rol);
            const isActive = item.activo !== false;

            return (
              <View style={[styles.card, !isActive && styles.cardSuspended]}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.userName}>{item.nombre_completo || 'Colaborador'}</Text>
                      <View
                        style={[
                          styles.statusBadge,
                          isActive ? styles.statusBadgeActive : styles.statusBadgeSuspended,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            isActive ? styles.statusTextActive : styles.statusTextSuspended,
                          ]}
                        >
                          {isActive ? '🟢 Activo' : '🔴 Suspendido'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.userEmail}>{item.email || 'Sin correo registrado'}</Text>
                  </View>
                  <View
                    style={[
                      styles.roleBadge,
                      { backgroundColor: roleBadge.bg, borderColor: roleBadge.border },
                    ]}
                  >
                    <Text style={[styles.roleBadgeText, { color: roleBadge.text }]}>
                      {roleBadge.label}
                    </Text>
                  </View>
                </View>

                {/* Detalles de Asignación */}
                <View style={styles.assignmentDetails}>
                  <Text style={styles.assignmentText}>
                    🚛 Camión: <Text style={styles.assignmentBold}>{item.codigo_camion || 'Sin asignar'}</Text>
                  </Text>
                  <Text style={styles.assignmentText}>
                    📍 Ruta: <Text style={styles.assignmentBold}>{item.ruta_asignada || 'Sin asignar'}</Text>
                  </Text>
                  {item.telefono ? (
                    <Text style={styles.assignmentText}>
                      📞 Tel: <Text style={styles.assignmentBold}>{item.telefono}</Text>
                    </Text>
                  ) : null}
                </View>

                {/* Acciones CRUD */}
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.actionBtnEdit}
                    onPress={() => handleOpenEdit(item)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.actionBtnEditText}>✏️ Editar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.actionBtnStatus,
                      isActive ? styles.actionBtnSuspend : styles.actionBtnActivate,
                    ]}
                    onPress={() => handleToggleStatus(item)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.actionBtnStatusText,
                        isActive ? styles.actionBtnSuspendText : styles.actionBtnActivateText,
                      ]}
                    >
                      {isActive ? '🔒 Suspender' : '🔓 Activar'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtnDelete}
                    onPress={() => handleDelete(item)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.actionBtnDeleteText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* ─── MODAL DE EDICIÓN DE COLABORADOR ──────────────────────────────── */}
      <Modal visible={editModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Editar Colaborador</Text>
            <Text style={styles.modalSubtitle}>
              Actualiza el rol y la información del colaborador municipal.
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Nombre Completo *</Text>
              <TextInput
                style={styles.modalInput}
                value={editNombre}
                onChangeText={setEditNombre}
                placeholder="Ej. Juan Pérez"
              />

              <Text style={styles.inputLabel}>Teléfono de Contacto</Text>
              <TextInput
                style={styles.modalInput}
                value={editTelefono}
                onChangeText={setEditTelefono}
                placeholder="Ej. +502 5555-5555"
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Rol Asignado *</Text>
              <View style={styles.rolePickerRow}>
                {[
                  { key: 'operario', label: '🚛 Operario' },
                  { key: 'piloto', label: '🧑‍✈️ Piloto' },
                  { key: 'supervisor', label: '📋 Supervisor' },
                ].map((r) => (
                  <TouchableOpacity
                    key={r.key}
                    style={[styles.roleSelectChip, editRol === r.key && styles.roleSelectChipActive]}
                    onPress={() => setEditRol(r.key)}
                  >
                    <Text
                      style={[
                        styles.roleSelectChipText,
                        editRol === r.key && styles.roleSelectChipTextActive,
                      ]}
                    >
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalActionsRow}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setEditModalVisible(false)}
                  disabled={isSaving}
                >
                  <Text style={styles.modalCancelBtnText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalSaveBtn, isSaving && styles.modalSaveBtnDisabled]}
                  onPress={handleSaveEdit}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalSaveBtnText}>Guardar Cambios</Text>
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
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  statLabel: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
    marginTop: 1,
  },
  searchInput: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: THEME.colors.textPrimary,
    marginBottom: 10,
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  filterChipActive: {
    backgroundColor: THEME.roles.admin,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
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
    color: THEME.colors.textSecondary,
    fontWeight: '600',
  },
  listContent: {
    padding: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardSuspended: {
    backgroundColor: '#FFF7F7',
    borderColor: '#FECACA',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  userName: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  userEmail: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusBadgeActive: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeSuspended: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusTextActive: {
    color: '#15803D',
  },
  statusTextSuspended: {
    color: '#B91C1C',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  assignmentDetails: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  assignmentText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginBottom: 2,
  },
  assignmentBold: {
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtnEdit: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnEditText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  actionBtnStatus: {
    flex: 1.2,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnSuspend: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  actionBtnActivate: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  actionBtnStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionBtnSuspendText: {
    color: '#DC2626',
  },
  actionBtnActivateText: {
    color: '#16A34A',
  },
  actionBtnDelete: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnDeleteText: {
    fontSize: 14,
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
    maxHeight: '85%',
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
    marginBottom: 6,
    marginTop: 10,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: THEME.colors.textPrimary,
  },
  rolePickerRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  roleSelectChip: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  roleSelectChipActive: {
    backgroundColor: '#EDE9FE',
    borderColor: THEME.roles.admin,
  },
  roleSelectChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
  },
  roleSelectChipTextActive: {
    color: THEME.roles.admin,
    fontWeight: '800',
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  modalSaveBtn: {
    flex: 1.5,
    paddingVertical: 12,
    backgroundColor: THEME.roles.admin,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalSaveBtnDisabled: {
    opacity: 0.7,
  },
  modalSaveBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
