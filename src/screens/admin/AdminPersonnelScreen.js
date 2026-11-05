import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Platform,
  Switch,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabase';
import { THEME } from '../../constants/theme';
import {
  updatePersonnel,
  togglePersonnelStatus,
  deletePersonnel,
  getTrucks,
  getRoutes,
} from '../../api/logistics';
import { registerEnterpriseUser } from '../../api/roles';

// Roles base del sistema para asignación rápida
const BASE_ROLES = [
  { key: 'operario', label: 'Operario', icon: '🚛' },
  { key: 'piloto', label: 'Piloto', icon: '🧑‍✈️' },
  { key: 'supervisor', label: 'Supervisor', icon: '📋' },
  { key: 'admin', label: 'Admin', icon: '⚙️' },
  { key: 'afiliado', label: 'Afiliado', icon: '🏪' },
  { key: 'cliente', label: 'Cliente', icon: '👤' },
];

/**
 * Pantalla dedicada 100% a la Gestión de Personal y Registro de Usuarios.
 * - Lista de empleados consultada exclusivamente desde la tabla `perfiles` de Supabase.
 * - Asignación directa de roles base y personalizados ('Otro rol...') en la columna `rol` de `perfiles`.
 */
export default function AdminPersonnelScreen({ navigation }) {
  // Pestaña activa: 'list' (Nómina de Personal) | 'register' (Registrar Usuario)
  const [activeTab, setActiveTab] = useState('list');

  // ─── ESTADOS DE DATOS REALES DE SUPABASE ──────────────────────────────────
  const [personnel, setPersonnel] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [routes, setRoutes] = useState([]);

  // Filtros y Búsqueda
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('todos');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ─── ESTADOS DEL FORMULARIO DE REGISTRO DE USUARIO ────────────────────────
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('EcoRuta2026*');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [selectedRole, setSelectedRole] = useState('operario');
  const [otherRoleInput, setOtherRoleInput] = useState('');
  const [useInviteFlow, setUseInviteFlow] = useState(false);
  const [isRegisteringUser, setIsRegisteringUser] = useState(false);

  // ─── MODAL DE ÉXITO DE REGISTRO ───────────────────────────────────────────
  const [registeredSuccessModal, setRegisteredSuccessModal] = useState(false);
  const [registeredUserData, setRegisteredUserData] = useState(null);

  // ─── MODAL DE EDICIÓN DE EMPLEADO ─────────────────────────────────────────
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [editNombre, setEditNombre] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editRol, setEditRol] = useState('');
  const [editCamion, setEditCamion] = useState('');
  const [editRuta, setEditRuta] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // ─── REQUERIMIENTO 2: CONSULTA EXCLUSIVA DE PERFILES EN SUPABASE ──────────
  const fetchPersonnel = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const { data, error } = await supabase
        .from('perfiles')
        .select('*')
        .order('nombre_completo', { ascending: true });

      if (error) {
        console.error('[AdminPersonnel] Error consultando perfiles:', error.message);
        Alert.alert('Error de Conexión', 'No se pudieron consultar los empleados de Supabase: ' + error.message);
        setPersonnel([]);
      } else {
        setPersonnel(data || []);
      }
    } catch (err) {
      console.error('[AdminPersonnel] Excepción consultando perfiles:', err);
      Alert.alert('Error', 'Ocurrió un problema al conectar con la base de datos de Supabase.');
      setPersonnel([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Soporte de logística para edición (camiones y rutas)
  const fetchLogisticsSupport = useCallback(async () => {
    try {
      const [tData, rData] = await Promise.all([
        getTrucks(false).catch(() => []),
        getRoutes().catch(() => []),
      ]);
      setTrucks(tData || []);
      setRoutes(rData || []);
    } catch (e) {
      console.warn('[AdminPersonnel] Error cargando camiones o rutas:', e);
    }
  }, []);

  useEffect(() => {
    fetchPersonnel();
    fetchLogisticsSupport();

    const unsubscribe = navigation?.addListener?.('focus', () => {
      fetchPersonnel(true);
    });
    return unsubscribe;
  }, [navigation, fetchPersonnel, fetchLogisticsSupport]);

  // ─── ACCIÓN: REGISTRAR USUARIO CON ROL DIRECTO EN PERFILES ─────────────────
  const handleRegisterUser = async () => {
    if (!newUserName.trim()) {
      Alert.alert('Campo Requerido', 'Por favor ingresa el nombre completo del colaborador.');
      return;
    }
    if (!newUserEmail.trim()) {
      Alert.alert('Campo Requerido', 'Por favor ingresa el correo corporativo.');
      return;
    }
    if (!newUserPassword || newUserPassword.length < 6) {
      Alert.alert('Contraseña Inválida', 'La contraseña inicial debe tener al menos 6 caracteres.');
      return;
    }

    // Rol directo: se usa "Otro rol..." si se escribió algo; de lo contrario el rol base seleccionado
    const finalRole = (otherRoleInput.trim() || selectedRole || 'operario').trim();

    setIsRegisteringUser(true);
    try {
      const result = await registerEnterpriseUser({
        email: newUserEmail,
        password: newUserPassword,
        nombreCompleto: newUserName,
        telefono: newUserPhone,
        rol: finalRole, // Se envía como string simple directamente para la columna `rol` de perfiles
        useInviteFlow,
      });

      setRegisteredUserData({
        ...result.user,
        nombre_completo: newUserName.trim(),
        email: newUserEmail.trim().toLowerCase(),
        telefono: newUserPhone.trim(),
        rol: finalRole,
        roleName: finalRole,
        password: newUserPassword,
        inviteCode: result.inviteCode,
        method: result.method,
      });
      setRegisteredSuccessModal(true);

      // Limpiar formulario tras éxito
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPhone('');
      setSelectedRole('operario');
      setOtherRoleInput('');
      setNewUserPassword('EcoRuta2026*');

      // Actualizar nómina de personal de inmediato
      await fetchPersonnel(true);
    } catch (err) {
      console.error('[AdminPersonnel] Error registrando usuario:', err);
      Alert.alert('Error de Registro', err.message || 'No se pudo completar el registro del usuario.');
    } finally {
      setIsRegisteringUser(false);
    }
  };

  // ─── ACCIÓN: SUSPENDER / ACTIVAR COLABORADOR ──────────────────────────────
  const handleToggleStatus = (item) => {
    const isCurrentlyActive = item.activo !== false;
    const nextState = !isCurrentlyActive;
    const actionWord = nextState ? 'Activar' : 'Suspender';

    Alert.alert(
      `Confirmar ${actionWord}`,
      `¿Deseas ${actionWord.toLowerCase()} el acceso de ${item.nombre_completo || 'este colaborador'} al sistema?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: `Sí, ${actionWord}`,
          style: nextState ? 'default' : 'destructive',
          onPress: async () => {
            try {
              await togglePersonnelStatus(item.id, nextState);
              await fetchPersonnel(true);
              Alert.alert('Actualizado', `Colaborador ${nextState ? 'activado' : 'suspendido'} exitosamente.`);
            } catch (err) {
              Alert.alert('Error', err.message || 'No se pudo cambiar el estado del colaborador.');
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
      `¿Estás seguro de eliminar a ${item.nombre_completo || 'este colaborador'} de la base de datos? Esta acción es irreversible.`,
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: 'Eliminar Definitivamente',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePersonnel(item.id);
              await fetchPersonnel(true);
              Alert.alert('Eliminado', 'El colaborador ha sido removido de la tabla perfiles.');
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
    if (!item) return;
    setSelectedUser(item);
    setEditNombre(item.nombre_completo || '');
    setEditTelefono(item.telefono || '');
    setEditRol(item.rol || 'Operario');
    setEditCamion(item.codigo_camion || '');
    setEditRuta(item.ruta_asignada || '');
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedUser?.id) return;
    if (!editNombre.trim()) {
      Alert.alert('Campo Requerido', 'Por favor ingresa el nombre del colaborador.');
      return;
    }

    setIsSavingEdit(true);
    try {
      const updates = {
        nombre_completo: editNombre.trim(),
        telefono: editTelefono.trim(),
        rol: editRol.trim(),
        codigo_camion: editCamion.trim() || null,
        ruta_asignada: editRuta.trim() || null,
      };

      await updatePersonnel(selectedUser.id, updates);
      setEditModalVisible(false);
      setSelectedUser(null);
      await fetchPersonnel(true);
      Alert.alert('✅ Cambios Guardados', 'Los datos del colaborador fueron actualizados en Supabase.');
    } catch (err) {
      console.error('[AdminPersonnel] Error al editar:', err);
      Alert.alert('Error al guardar', err.message || 'No se pudieron actualizar los datos.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // ─── UTILIDADES DE COPIADO DE CREDENCIALES (REQUERIMIENTO 5) ─────────────
  const handleCopyText = async (text, label = 'Dato') => {
    if (!text) return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        Alert.alert('✅ Copiado', `${label} copiado al portapapeles.`);
        return;
      } catch (e) {
        console.warn('Clipboard write error:', e);
      }
    }
    Alert.alert(
      `📋 ${label}`,
      `Texto:\n\n${text}\n\n(Puedes mantener presionado el texto para seleccionarlo y copiarlo).`
    );
  };

  const handleCopyAllCredentials = async () => {
    if (!registeredUserData) return;
    const formatted = [
      '═══════════════════════════════════════',
      '🌱 CREDENCIALES DE ACCESO - ECORUTA PALÍN',
      '═══════════════════════════════════════',
      `👤 Nombre: ${registeredUserData.nombre_completo || 'Colaborador'}`,
      `🏷️ Rol en Sistema: ${registeredUserData.roleName || registeredUserData.rol}`,
      `📧 Correo: ${registeredUserData.email}`,
      `🔑 Contraseña: ${registeredUserData.password || 'EcoRuta2026*'}`,
      registeredUserData.telefono ? `📞 Teléfono: ${registeredUserData.telefono}` : null,
      registeredUserData.inviteCode ? `🎟️ Código Invitación: ${registeredUserData.inviteCode}` : null,
      '═══════════════════════════════════════',
    ]
      .filter(Boolean)
      .join('\n');

    await handleCopyText(formatted, 'Credenciales completas');
  };

  // ─── FILTRADO Y ESTADÍSTICAS DINÁMICAS ───────────────────────────────────
  const distinctRoles = ['todos', ...new Set(personnel.map((p) => (p.rol || '').trim()).filter(Boolean))];

  const filteredPersonnel = personnel.filter((p) => {
    const roleMatch = filterRole === 'todos' || (p.rol && p.rol.toLowerCase() === filterRole.toLowerCase());
    const query = searchQuery.toLowerCase().trim();
    const searchMatch =
      !query ||
      (p.nombre_completo && p.nombre_completo.toLowerCase().includes(query)) ||
      (p.email && p.email.toLowerCase().includes(query)) ||
      (p.rol && p.rol.toLowerCase().includes(query)) ||
      (p.codigo_camion && p.codigo_camion.toLowerCase().includes(query)) ||
      (p.ruta_asignada && p.ruta_asignada.toLowerCase().includes(query));

    return roleMatch && searchMatch;
  });

  const countActivos = personnel.filter((p) => p.activo !== false).length;
  const countSuspendidos = personnel.filter((p) => p.activo === false).length;

  const getRoleBadge = (rol) => {
    const r = (rol || '').toLowerCase();
    if (r.includes('admin')) return { bg: '#EDE9FE', text: '#6D28D9', border: '#DDD6FE', icon: '⚙️' };
    if (r.includes('supervis')) return { bg: '#FEF3C7', text: '#B45309', border: '#FDE68A', icon: '📋' };
    if (r.includes('pilot')) return { bg: '#E0F2FE', text: '#0369A1', border: '#BAE6FD', icon: '🧑‍✈️' };
    if (r.includes('ayudant')) return { bg: '#FEE2E2', text: '#B91C1C', border: '#FECACA', icon: '🤝' };
    if (r.includes('afiliad') || r.includes('comerc')) return { bg: '#D1FAE5', text: '#047857', border: '#A7F3D0', icon: '🏪' };
    if (r.includes('client') || r.includes('ciudad')) return { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1', icon: '👤' };
    return { bg: '#DBEAFE', text: '#1E40AF', border: '#BFDBFE', icon: '🚛' };
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ─── ENCABEZADO DEDICADO 100% A PERSONAL Y REGISTRO (REQ 1) ───────── */}
      <View style={styles.headerContainer}>
        <View style={styles.headerTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>👥 Gestión de Personal</Text>
            <Text style={styles.subtitle}>
              Nómina de colaboradores y registro de nuevos usuarios en Supabase
            </Text>
          </View>
        </View>

        {/* Tabulador Principal: Lista vs Registrar */}
        <View style={styles.tabNavRow}>
          <TouchableOpacity
            style={[styles.tabNavBtn, activeTab === 'list' && styles.tabNavBtnActive]}
            onPress={() => setActiveTab('list')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabNavBtnText, activeTab === 'list' && styles.tabNavBtnTextActive]}>
              📋 Lista de Personal ({personnel.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabNavBtn, activeTab === 'register' && styles.tabNavBtnActive]}
            onPress={() => setActiveTab('register')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabNavBtnText, activeTab === 'register' && styles.tabNavBtnTextActive]}>
              ➕ Registrar Usuario
            </Text>
          </TouchableOpacity>
        </View>

        {/* Controles y Búsqueda solo en la pestaña de Lista */}
        {activeTab === 'list' && (
          <>
            {/* Barra de Estadísticas */}
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
              placeholder="🔍 Buscar por nombre, correo, rol o camión..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />

            {/* Filtros dinámicos por rol */}
            {distinctRoles.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll}>
                {distinctRoles.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.filterChip, filterRole === r && styles.filterChipActive]}
                    onPress={() => setFilterRole(r)}
                  >
                    <Text style={[styles.filterChipText, filterRole === r && styles.filterChipTextActive]}>
                      {r === 'todos' ? 'Todos' : r.charAt(0).toUpperCase() + r.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </>
        )}
      </View>

      {/* ─── PESTAÑA 1: LISTA DE PERSONAL (TABLA EXCLUSIVA DE SUPABASE) ──── */}
      {activeTab === 'list' && (
        <>
          {isLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={THEME.roles.admin} />
              <Text style={styles.loadingText}>Consultando tabla perfiles en Supabase...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredPersonnel}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={() => fetchPersonnel(true)}
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
                      ? 'No hay registros que coincidan con la búsqueda.'
                      : 'Aún no hay usuarios en la tabla `perfiles` de Supabase.'}
                  </Text>
                  <TouchableOpacity
                    style={styles.emptyCreateBtn}
                    onPress={() => setActiveTab('register')}
                  >
                    <Text style={styles.emptyCreateBtnText}>+ Registrar Primer Colaborador</Text>
                  </TouchableOpacity>
                </View>
              }
              renderItem={({ item }) => {
                const roleBadge = getRoleBadge(item.rol);
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

                      {/* Badge dinámico de rol */}
                      <View
                        style={[
                          styles.roleBadge,
                          { backgroundColor: roleBadge.bg, borderColor: roleBadge.border },
                        ]}
                      >
                        <Text style={[styles.roleBadgeText, { color: roleBadge.text }]}>
                          {roleBadge.icon} {item.rol || 'Sin rol'}
                        </Text>
                      </View>
                    </View>

                    {/* Detalle de asignación si existe */}
                    {(item.codigo_camion || item.ruta_asignada || item.telefono || item.departamento) && (
                      <View style={styles.assignmentDetails}>
                        {item.codigo_camion ? (
                          <Text style={styles.assignmentText}>
                            🚛 Camión: <Text style={styles.assignmentBold}>{item.codigo_camion}</Text>
                          </Text>
                        ) : null}
                        {item.ruta_asignada ? (
                          <Text style={styles.assignmentText}>
                            📍 Ruta: <Text style={styles.assignmentBold}>{item.ruta_asignada}</Text>
                          </Text>
                        ) : null}
                        {item.telefono ? (
                          <Text style={styles.assignmentText}>
                            📞 Tel: <Text style={styles.assignmentBold}>{item.telefono}</Text>
                          </Text>
                        ) : null}
                        {item.departamento ? (
                          <Text style={styles.assignmentText}>
                            🏢 Área: <Text style={styles.assignmentBold}>{item.departamento}</Text>
                          </Text>
                        ) : null}
                      </View>
                    )}

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
        </>
      )}

      {/* ─── PESTAÑA 2: FORMULARIO REGISTRAR USUARIO CON ROLES DINÁMICOS ──── */}
      {activeTab === 'register' && (
        <ScrollView
          style={styles.registerScroll}
          contentContainerStyle={styles.registerScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* CARD 1: DATOS DEL EMPLEADO */}
          <View style={styles.formCard}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.cardHeaderIconBadge, { backgroundColor: '#EDE9FE' }]}>
                <Text style={styles.cardHeaderIcon}>👤</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Datos del Empleado</Text>
                <Text style={styles.cardSubtitle}>
                  Información personal y vías de comunicación directa
                </Text>
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.inputLabel}>Nombre Completo *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ej. Juan Carlos Méndez"
                placeholderTextColor="#94A3B8"
                value={newUserName}
                onChangeText={setNewUserName}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.inputLabel}>Teléfono de Contacto</Text>
              <TextInput
                style={styles.textInput}
                placeholder="+502 5555-5555"
                placeholderTextColor="#94A3B8"
                value={newUserPhone}
                onChangeText={setNewUserPhone}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          {/* CARD 2: CREDENCIALES DE ACCESO */}
          <View style={styles.formCard}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.cardHeaderIconBadge, { backgroundColor: '#FEF3C7' }]}>
                <Text style={styles.cardHeaderIcon}>🔑</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Credenciales de Acceso</Text>
                <Text style={styles.cardSubtitle}>
                  Cuenta para autenticación en Supabase Auth
                </Text>
              </View>
            </View>

            {/* Selector de Modo */}
            <View style={styles.modeToggleCard}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.modeToggleTitle}>
                  {useInviteFlow ? 'Flujo de Invitación Corporativa' : 'Alta Directa en Supabase Auth'}
                </Text>
                <Text style={styles.modeToggleSub}>
                  {useInviteFlow
                    ? 'Genera un código de invitación seguro para compartir con el usuario.'
                    : 'Crea y activa el usuario directamente sin cerrar tu sesión actual.'}
                </Text>
              </View>
              <Switch
                value={useInviteFlow}
                onValueChange={setUseInviteFlow}
                trackColor={{ false: '#CBD5E1', true: THEME.roles.admin }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.inputLabel}>Correo Electrónico *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="colaborador@ecoruta.com"
                placeholderTextColor="#94A3B8"
                value={newUserEmail}
                onChangeText={setNewUserEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.fieldGroup}>
              <View style={styles.labelWithHelperRow}>
                <Text style={styles.inputLabel}>Contraseña Inicial *</Text>
                <TouchableOpacity
                  onPress={() => setNewUserPassword(`Eco${Math.floor(1000 + Math.random() * 9000)}*`)}
                >
                  <Text style={styles.labelHelperAction}>🎲 Generar segura</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.textInput}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor="#94A3B8"
                value={newUserPassword}
                onChangeText={setNewUserPassword}
              />
            </View>
          </View>

          {/* CARD 3: ASIGNACIÓN DE ROL */}
          <View style={styles.formCard}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.cardHeaderIconBadge, { backgroundColor: '#E0F2FE' }]}>
                <Text style={styles.cardHeaderIcon}>🛡️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Asignación de Rol</Text>
                <Text style={styles.cardSubtitle}>
                  Selecciona un rol base o escribe un rol personalizado para `perfiles`
                </Text>
              </View>
            </View>

            {/* Selector simple con los 6 roles base */}
            <Text style={styles.inputLabel}>Selecciona un Rol Base *</Text>
            <View style={styles.baseRolesGrid}>
              {BASE_ROLES.map((r) => {
                const isSelected = selectedRole === r.key && !otherRoleInput.trim();
                return (
                  <TouchableOpacity
                    key={r.key}
                    style={[styles.baseRoleChip, isSelected && styles.baseRoleChipActive]}
                    onPress={() => {
                      setSelectedRole(r.key);
                      setOtherRoleInput('');
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.baseRoleChipIcon}>{r.icon}</Text>
                    <Text
                      style={[
                        styles.baseRoleChipText,
                        isSelected && styles.baseRoleChipTextActive,
                      ]}
                    >
                      {r.label}
                    </Text>
                    {isSelected && <Text style={styles.baseRoleChipCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Campo de texto opcional: "Otro rol..." */}
            <View style={styles.otherRoleContainer}>
              <Text style={styles.inputLabel}>Otro rol... (opcional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Escribe libremente un nuevo rol (ej. ayudante, guardia)"
                placeholderTextColor="#94A3B8"
                value={otherRoleInput}
                onChangeText={setOtherRoleInput}
                autoCapitalize="none"
              />
              <Text style={styles.otherRoleHint}>
                Rol a guardar en la tabla perfiles:{' '}
                <Text style={styles.otherRoleHintBold}>
                  {(otherRoleInput.trim() || selectedRole || 'operario').trim()}
                </Text>
              </Text>
            </View>
          </View>

          {/* BOTÓN DE ACCIÓN FINAL */}
          <View style={styles.submitSection}>
            <TouchableOpacity
              style={[
                styles.submitUserBtn,
                isRegisteringUser && styles.submitUserBtnDisabled,
              ]}
              onPress={handleRegisterUser}
              disabled={isRegisteringUser}
              activeOpacity={0.85}
            >
              {isRegisteringUser ? (
                <View style={styles.btnRow}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.submitUserBtnText}> Guardando en Supabase...</Text>
                </View>
              ) : (
                <Text style={styles.submitUserBtnText}>
                  {useInviteFlow ? '📨 Generar Invitación' : '🚀 Registrar Usuario'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* ─── MODAL DE ÉXITO DE REGISTRO (REQUERIMIENTO 5) ───────────────────── */}
      <Modal visible={registeredSuccessModal} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardSuccess}>
            <View style={styles.successIconBadge}>
              <Text style={styles.successIcon}>🎉</Text>
            </View>

            <Text style={styles.successTitle}>¡Usuario Registrado!</Text>
            <Text style={styles.successSubtitle}>
              Se guardó el usuario en Supabase Auth y su perfil en `perfiles` con el rol seleccionado.
            </Text>

            {/* Credenciales Estilizadas */}
            <View style={styles.credentialsContainer}>
              <View style={styles.credentialHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.credentialUserName}>
                    {registeredUserData?.nombre_completo}
                  </Text>
                  <Text style={styles.credentialUserSub}>
                    {registeredUserData?.departamento || 'EcoRuta Palín'}
                  </Text>
                </View>
                <View style={styles.credentialRoleBadge}>
                  <Text style={styles.credentialRoleBadgeText}>
                    🛡️ {registeredUserData?.roleName || registeredUserData?.rol}
                  </Text>
                </View>
              </View>

              {/* Fila Correo */}
              <View style={styles.credentialItemBox}>
                <View style={styles.credentialItemLabelRow}>
                  <Text style={styles.credentialItemLabel}>📧 CORREO ELECTRÓNICO</Text>
                  <TouchableOpacity
                    onPress={() => handleCopyText(registeredUserData?.email, 'Correo Electrónico')}
                    style={styles.copyMiniBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.copyMiniBtnText}>📋 Copiar</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.credentialMonoText} selectable={true}>
                  {registeredUserData?.email}
                </Text>
              </View>

              {/* Fila Contraseña */}
              <View style={styles.credentialItemBox}>
                <View style={styles.credentialItemLabelRow}>
                  <Text style={styles.credentialItemLabel}>🔑 CONTRASEÑA INICIAL</Text>
                  <TouchableOpacity
                    onPress={() => handleCopyText(registeredUserData?.password, 'Contraseña')}
                    style={styles.copyMiniBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.copyMiniBtnText}>📋 Copiar</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.credentialMonoText} selectable={true}>
                  {registeredUserData?.password}
                </Text>
              </View>

              {/* Fila Rol en BD */}
              <View style={styles.credentialItemBox}>
                <View style={styles.credentialItemLabelRow}>
                  <Text style={styles.credentialItemLabel}>🏷️ ROL EN TABLA PERFILES</Text>
                </View>
                <Text style={styles.credentialRoleSaved} selectable={true}>
                  {registeredUserData?.rol}
                </Text>
              </View>

              {/* Fila Token de Invitación (si aplica) */}
              {Boolean(registeredUserData?.inviteCode) && (
                <View style={[styles.credentialItemBox, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                  <View style={styles.credentialItemLabelRow}>
                    <Text style={[styles.credentialItemLabel, { color: '#166534' }]}>
                      🎟️ CÓDIGO DE INVITACIÓN
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleCopyText(registeredUserData?.inviteCode, 'Código de Invitación')}
                      style={[styles.copyMiniBtn, { backgroundColor: '#DCFCE7' }]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.copyMiniBtnText, { color: '#15803D' }]}>📋 Copiar</Text>
                    </TouchableOpacity>
                  </View>
                  <Text
                    style={[styles.credentialMonoText, { color: '#15803D', fontWeight: '800' }]}
                    selectable={true}
                  >
                    {registeredUserData?.inviteCode}
                  </Text>
                </View>
              )}
            </View>

            {/* Botones de Acción */}
            <View style={styles.modalSuccessActions}>
              <TouchableOpacity
                style={styles.copyAllBtn}
                onPress={handleCopyAllCredentials}
                activeOpacity={0.8}
              >
                <Text style={styles.copyAllBtnText}>📋 Copiar Todo el Formato</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalDoneBtn}
                onPress={() => {
                  setRegisteredSuccessModal(false);
                  setRegisteredUserData(null);
                  setActiveTab('list');
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.modalDoneBtnText}>Listo, Ver Lista de Personal</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL DE EDICIÓN DE EMPLEADO ──────────────────────────────────── */}
      <Modal visible={editModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Editar Colaborador</Text>
            <Text style={styles.modalSubtitle}>
              Actualiza el rol y los datos del colaborador en Supabase.
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

              <Text style={styles.inputLabel}>Rol del Colaborador *</Text>
              <TextInput
                style={styles.modalInput}
                value={editRol}
                onChangeText={setEditRol}
                placeholder="Ej. Piloto, Ayudante, Operario..."
              />

              {/* Chips rápidos de roles base */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickChipsRow}>
                {BASE_ROLES.map((r) => (
                  <TouchableOpacity
                    key={r.key}
                    style={[
                      styles.quickSelectChip,
                      (editRol || '').toLowerCase() === r.key && styles.quickSelectChipActive,
                    ]}
                    onPress={() => setEditRol(r.key)}
                  >
                    <Text
                      style={[
                        styles.quickSelectChipText,
                        (editRol || '').toLowerCase() === r.key && styles.quickSelectChipTextActive,
                      ]}
                    >
                      {r.icon} {r.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.inputLabel, { marginTop: 12 }]}>Camión Asignado (Opcional)</Text>
              <TextInput
                style={styles.modalInput}
                value={editCamion}
                onChangeText={setEditCamion}
                placeholder="Ej. CAM-01"
                autoCapitalize="characters"
              />
              {trucks.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickChipsRow}>
                  {trucks.map((t) => (
                    <TouchableOpacity
                      key={t.id?.toString()}
                      style={[styles.quickSelectChip, editCamion === t.codigo && styles.quickSelectChipActive]}
                      onPress={() => setEditCamion(t.codigo)}
                    >
                      <Text
                        style={[
                          styles.quickSelectChipText,
                          editCamion === t.codigo && styles.quickSelectChipTextActive,
                        ]}
                      >
                        🚛 {t.codigo}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              <Text style={[styles.inputLabel, { marginTop: 12 }]}>Ruta Asignada (Opcional)</Text>
              <TextInput
                style={styles.modalInput}
                value={editRuta}
                onChangeText={setEditRuta}
                placeholder="Ej. Zona 1 — Casco Urbano"
              />
              {routes.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickChipsRow}>
                  {routes.map((r) => (
                    <TouchableOpacity
                      key={r.id?.toString()}
                      style={[styles.quickSelectChip, editRuta === r.nombre && styles.quickSelectChipActive]}
                      onPress={() => setEditRuta(r.nombre)}
                    >
                      <Text
                        style={[
                          styles.quickSelectChipText,
                          editRuta === r.nombre && styles.quickSelectChipTextActive,
                        ]}
                      >
                        📍 {r.nombre}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              <View style={styles.modalActionsRow}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setEditModalVisible(false)}
                  disabled={isSavingEdit}
                >
                  <Text style={styles.modalCancelBtnText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalSaveBtn, isSavingEdit && styles.modalSaveBtnDisabled]}
                  onPress={handleSaveEdit}
                  disabled={isSavingEdit}
                >
                  {isSavingEdit ? (
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
    ...(Platform.OS === 'web' && {
      maxWidth: 900,
      width: '100%',
      alignSelf: 'center',
    }),
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
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
  tabNavRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginTop: 10,
    marginBottom: 8,
    gap: 4,
  },
  tabNavBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabNavBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabNavBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabNavBtnTextActive: {
    color: THEME.roles.admin,
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    marginTop: 6,
    marginBottom: 8,
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
    paddingVertical: 8,
    fontSize: 13,
    color: THEME.colors.textPrimary,
    marginBottom: 6,
  },
  filtersScroll: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    marginRight: 6,
  },
  filterChipActive: {
    backgroundColor: THEME.roles.admin,
  },
  filterChipText: {
    fontSize: 11,
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
    padding: 16,
    paddingBottom: 40,
    ...(Platform.OS === 'web' && {
      maxWidth: 900,
      width: '100%',
      alignSelf: 'center',
    }),
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
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  userEmail: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 7,
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
    marginBottom: 10,
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
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  emptyDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  emptyCreateBtn: {
    backgroundColor: THEME.roles.admin,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  emptyCreateBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // ─── FORMULARIO REDISEÑADO: REGISTRAR USUARIO ────────────────────────────
  registerScroll: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  registerScrollContent: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
    ...(Platform.OS === 'web' && {
      maxWidth: 800,
      width: '100%',
      alignSelf: 'center',
    }),
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cardHeaderIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderIcon: {
    fontSize: 20,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  labelWithHelperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelHelperAction: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.roles.admin,
  },
  modeToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  modeToggleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  modeToggleSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
    marginTop: 4,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
  },

  // Selector de roles base
  baseRolesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
    marginBottom: 12,
  },
  baseRoleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    gap: 6,
  },
  baseRoleChipActive: {
    backgroundColor: '#EDE9FE',
    borderColor: THEME.roles.admin,
    shadowColor: THEME.roles.admin,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  baseRoleChipIcon: {
    fontSize: 14,
  },
  baseRoleChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  baseRoleChipTextActive: {
    color: THEME.roles.admin,
    fontWeight: '800',
  },
  baseRoleChipCheck: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.roles.admin,
  },
  otherRoleContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  otherRoleHint: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 6,
  },
  otherRoleHintBold: {
    fontWeight: '800',
    color: THEME.roles.admin,
  },

  deptChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  deptChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  deptChipActive: {
    backgroundColor: '#EDE9FE',
    borderColor: THEME.roles.admin,
  },
  deptChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  deptChipTextActive: {
    color: THEME.roles.admin,
    fontWeight: '700',
  },
  submitSection: {
    marginTop: 4,
    marginBottom: 16,
  },
  submitUserBtn: {
    backgroundColor: THEME.roles.admin,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    shadowColor: THEME.roles.admin,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  submitUserBtnDisabled: {
    opacity: 0.7,
  },
  submitUserBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // ─── MODAL DE ÉXITO ───────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCardSuccess: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  successIconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  successIcon: {
    fontSize: 28,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  successSubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 3,
    marginBottom: 16,
    lineHeight: 17,
  },
  credentialsContainer: {
    width: '100%',
    gap: 8,
    marginBottom: 16,
  },
  credentialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  credentialUserName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  credentialUserSub: {
    fontSize: 11,
    color: '#64748B',
  },
  credentialRoleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#EDE9FE',
  },
  credentialRoleBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.roles.admin,
  },
  credentialItemBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  credentialItemLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  credentialItemLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  copyMiniBtn: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  copyMiniBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.roles.admin,
  },
  credentialMonoText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  credentialRoleSaved: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.roles.admin,
    textTransform: 'uppercase',
  },
  modalSuccessActions: {
    width: '100%',
    gap: 8,
  },
  copyAllBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  copyAllBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  modalDoneBtn: {
    backgroundColor: THEME.roles.admin,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalDoneBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  // ─── MODAL DE EDICIÓN ─────────────────────────────────────────────────────
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginBottom: 12,
    marginTop: 1,
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
  quickChipsRow: {
    flexDirection: 'row',
    marginTop: 6,
    marginBottom: 4,
  },
  quickSelectChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginRight: 6,
  },
  quickSelectChipActive: {
    backgroundColor: '#EDE9FE',
    borderColor: THEME.roles.admin,
  },
  quickSelectChipText: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
  },
  quickSelectChipTextActive: {
    color: THEME.roles.admin,
    fontWeight: '800',
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
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
    color: THEME.colors.textSecondary,
  },
  modalSaveBtn: {
    flex: 1.5,
    paddingVertical: 10,
    backgroundColor: THEME.roles.admin,
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
});
