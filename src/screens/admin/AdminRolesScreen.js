import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { THEME } from '../../constants/theme';
import {
  ENTERPRISE_MODULES,
  PERMISSION_ACTIONS,
  getEnterpriseRoles,
  createEnterpriseRole,
  updateEnterpriseRole,
  deleteEnterpriseRole,
  registerEnterpriseUser,
  getEnterpriseUsers,
  getRolesTableSqlScript,
} from '../../api/roles';

export default function AdminRolesScreen({ navigation }) {
  // Pestaña activa: 'roles' (Gestión de Roles y Matriz) | 'register' (Formulario Usuario) | 'users' (Usuarios Asignados)
  const [activeTab, setActiveTab] = useState('roles');

  // Estados de datos
  const [roles, setRoles] = useState([]);
  const [enterpriseUsers, setEnterpriseUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ─── ESTADOS PARA CREACIÓN / EDICIÓN DE ROL CON MATRIZ DE CHECKBOXES ─────
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [roleName, setRoleName] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [isSavingRole, setIsSavingRole] = useState(false);

  // Matriz de permisos interactiva: { [moduloKey]: { leer: boolean, escribir: boolean, borrar: boolean } }
  const createEmptyMatrix = () => {
    const matrix = {};
    ENTERPRISE_MODULES.forEach((mod) => {
      matrix[mod.key] = { leer: false, escribir: false, borrar: false };
    });
    return matrix;
  };
  const [permissionMatrix, setPermissionMatrix] = useState(createEmptyMatrix);

  // ─── ESTADOS PARA FORMULARIO DE REGISTRO DE USUARIO EMPRESARIAL ─────────
  const [userNombre, setUserNombre] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('EcoRuta2026*');
  const [userTelefono, setUserTelefono] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [userBaseRole, setUserBaseRole] = useState('supervisor'); // 'supervisor' | 'admin'
  const [userDept, setUserDept] = useState('Logística y Control');
  const [useInviteMode, setUseInviteMode] = useState(false);
  const [isRegisteringUser, setIsRegisteringUser] = useState(false);

  // Modal de resultado de registro / invitación
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [createdUserData, setCreatedUserData] = useState(null);

  // Modal para ver script SQL DDL
  const [sqlModalVisible, setSqlModalVisible] = useState(false);

  // Carga inicial y reactiva
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const [rolesData, usersData] = await Promise.all([
        getEnterpriseRoles(),
        getEnterpriseUsers(),
      ]);
      setRoles(rolesData || []);
      setEnterpriseUsers(usersData || []);

      // Auto-seleccionar primer rol para el formulario de registro si aún no hay uno
      if (rolesData && rolesData.length > 0 && !selectedRoleId) {
        setSelectedRoleId(rolesData[0].id);
      }
    } catch (err) {
      console.error('[AdminRolesScreen] Error cargando datos:', err);
      Alert.alert('Error', 'No se pudieron sincronizar los roles con Supabase.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedRoleId]);

  useEffect(() => {
    loadData();
    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadData(true);
    });
    return unsubscribe;
  }, [navigation, loadData]);

  // ─── MANEJADORES DE LA MATRIZ DE CHECKBOXES ─────────────────────────────
  const togglePermission = (moduloKey, actionKey) => {
    setPermissionMatrix((prev) => {
      const currentMod = prev[moduloKey] || { leer: false, escribir: false, borrar: false };
      return {
        ...prev,
        [moduloKey]: {
          ...currentMod,
          [actionKey]: !currentMod[actionKey],
        },
      };
    });
  };

  const toggleRowAll = (moduloKey, targetValue) => {
    setPermissionMatrix((prev) => ({
      ...prev,
      [moduloKey]: {
        leer: targetValue,
        escribir: targetValue,
        borrar: targetValue,
      },
    }));
  };

  const applyPreset = (presetType) => {
    const nextMatrix = {};
    ENTERPRISE_MODULES.forEach((mod) => {
      if (presetType === 'all') {
        nextMatrix[mod.key] = { leer: true, escribir: true, borrar: true };
      } else if (presetType === 'readonly') {
        nextMatrix[mod.key] = { leer: true, escribir: false, borrar: false };
      } else if (presetType === 'clear') {
        nextMatrix[mod.key] = { leer: false, escribir: false, borrar: false };
      } else if (presetType === 'logistics_lead') {
        if (mod.key === 'Logística') nextMatrix[mod.key] = { leer: true, escribir: true, borrar: true };
        else nextMatrix[mod.key] = { leer: true, escribir: false, borrar: false };
      } else if (presetType === 'finance_lead') {
        if (mod.key === 'Finanzas') nextMatrix[mod.key] = { leer: true, escribir: true, borrar: true };
        else nextMatrix[mod.key] = { leer: true, escribir: false, borrar: false };
      } else if (presetType === 'audit_lead') {
        if (mod.key === 'Auditoría') nextMatrix[mod.key] = { leer: true, escribir: true, borrar: true };
        else nextMatrix[mod.key] = { leer: true, escribir: false, borrar: false };
      }
    });
    setPermissionMatrix(nextMatrix);
  };

  // ─── ABRIR MODAL PARA CREAR ROL ──────────────────────────────────────────
  const handleOpenCreateRole = () => {
    setEditingRoleId(null);
    setRoleName('');
    setRoleDesc('');
    setPermissionMatrix(createEmptyMatrix());
    setIsRoleModalOpen(true);
  };

  // ─── ABRIR MODAL PARA EDITAR ROL EXISTENTE ────────────────────────────────
  const handleOpenEditRole = (role) => {
    setEditingRoleId(role.id);
    setRoleName(role.nombre || '');
    setRoleDesc(role.descripcion || '');

    const populatedMatrix = createEmptyMatrix();
    (role.permisos || []).forEach((p) => {
      const matchMod = ENTERPRISE_MODULES.find(
        (m) => m.key.toLowerCase() === (p.modulo || '').toLowerCase()
      );
      if (matchMod) {
        populatedMatrix[matchMod.key] = {
          leer: Boolean(p.leer),
          escribir: Boolean(p.escribir),
          borrar: Boolean(p.borrar),
        };
      }
    });
    setPermissionMatrix(populatedMatrix);
    setIsRoleModalOpen(true);
  };

  // ─── GUARDAR ROL Y MATRIZ DE PERMISOS EN SUPABASE ─────────────────────────
  const handleSaveRole = async () => {
    if (!roleName.trim()) {
      Alert.alert('Campo Requerido', 'Por favor ingresa un nombre para el rol empresarial.');
      return;
    }

    // Convertir matriz a array de permisos por módulo
    const permissionsArray = ENTERPRISE_MODULES.map((mod) => ({
      modulo: mod.key,
      leer: Boolean(permissionMatrix[mod.key]?.leer),
      escribir: Boolean(permissionMatrix[mod.key]?.escribir),
      borrar: Boolean(permissionMatrix[mod.key]?.borrar),
    }));

    setIsSavingRole(true);
    try {
      if (editingRoleId) {
        // Actualizar rol y permisos
        await updateEnterpriseRole(editingRoleId, {
          nombre: roleName.trim(),
          descripcion: roleDesc.trim(),
          permisos: permissionsArray,
        });
        Alert.alert('✅ Rol Actualizado', `Los permisos del rol "${roleName.trim()}" fueron guardados en Supabase.`);
      } else {
        // Crear nuevo rol
        await createEnterpriseRole({
          nombre: roleName.trim(),
          descripcion: roleDesc.trim(),
          permisos: permissionsArray,
        });
        Alert.alert('🎉 Rol Creado', `El rol empresarial "${roleName.trim()}" fue registrado con su matriz de permisos.`);
      }

      await loadData(true);
      setIsRoleModalOpen(false);
      setEditingRoleId(null);
    } catch (err) {
      console.error('[AdminRolesScreen] Error al guardar rol:', err);
      Alert.alert('Error al guardar', err.message || 'No se pudo guardar el rol en Supabase.');
    } finally {
      setIsSavingRole(false);
    }
  };

  // ─── ELIMINAR ROL EMPRESARIAL ────────────────────────────────────────────
  const handleDeleteRole = (role) => {
    Alert.alert(
      '⚠️ Eliminar Rol',
      `¿Deseas eliminar el rol "${role.nombre}" y todos sus permisos configurados?\n\nLos usuarios que tengan este rol conservarán su acceso base pero perderán los permisos específicos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar Rol',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteEnterpriseRole(role.id);
              await loadData(true);
              Alert.alert('Eliminado', 'El rol ha sido removido de la base de datos.');
            } catch (err) {
              Alert.alert('Error', err.message || 'No se pudo eliminar el rol.');
            }
          },
        },
      ]
    );
  };

  // ─── REGISTRAR USUARIO EMPRESARIAL (FORMULARIO) ───────────────────────────
  const handleRegisterUser = async () => {
    if (!userNombre.trim()) {
      Alert.alert('Campo Requerido', 'Ingresa el nombre completo del colaborador empresarial.');
      return;
    }
    if (!userEmail.trim()) {
      Alert.alert('Campo Requerido', 'Ingresa el correo electrónico corporativo.');
      return;
    }
    if (!userPassword || userPassword.length < 6) {
      Alert.alert('Contraseña Inválida', 'La contraseña inicial debe tener al menos 6 caracteres.');
      return;
    }
    if (!selectedRoleId) {
      Alert.alert('Rol Requerido', 'Selecciona un rol empresarial de la lista para asignarle permisos.');
      return;
    }

    const assignedRoleObj = roles.find((r) => r.id === selectedRoleId);
    const assignedRoleName = assignedRoleObj ? assignedRoleObj.nombre : 'Rol Empresarial';

    setIsRegisteringUser(true);
    try {
      const result = await registerEnterpriseUser({
        email: userEmail,
        password: userPassword,
        nombreCompleto: userNombre,
        telefono: userTelefono,
        rolEmpresarialId: selectedRoleId,
        rolEmpresarialNombre: assignedRoleName,
        baseRol: userBaseRole,
        departamento: userDept,
        useInviteFlow: useInviteMode,
      });

      setCreatedUserData({
        ...result.user,
        inviteCode: result.inviteCode,
        method: result.method,
        password: userPassword,
        roleName: assignedRoleName,
      });
      setInviteModalVisible(true);

      // Limpiar campos tras éxito
      setUserNombre('');
      setUserEmail('');
      setUserTelefono('');
      setUserPassword('EcoRuta2026*');

      await loadData(true);
    } catch (err) {
      console.error('[AdminRolesScreen] Error registrando usuario empresarial:', err);
      Alert.alert('Error de Registro', err.message || 'No se pudo completar el registro del usuario.');
    } finally {
      setIsRegisteringUser(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* ─── ENCABEZADO SUPERIOR ────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>🏢 CONTROL DE ACCESO CORPORATIVO</Text>
            </View>
            <Text style={styles.title}>Roles y Permisos Empresariales</Text>
            <Text style={styles.subtitle}>
              Matriz de permisos por módulo (Logística, Finanzas, Auditoría) y alta de usuarios
            </Text>
          </View>
          <TouchableOpacity
            style={styles.sqlHelpBtn}
            onPress={() => setSqlModalVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.sqlHelpBtnText}>📄 SQL</Text>
          </TouchableOpacity>
        </View>

        {/* Barra de Estadísticas */}
        <View style={styles.statsCard}>
          <View style={styles.statCol}>
            <Text style={styles.statVal}>{roles.length}</Text>
            <Text style={styles.statLbl}>Roles Creados</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCol}>
            <Text style={[styles.statVal, { color: '#059669' }]}>3 Módulos</Text>
            <Text style={styles.statLbl}>Log • Fin • Aud</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCol}>
            <Text style={[styles.statVal, { color: THEME.roles.admin }]}>{enterpriseUsers.length}</Text>
            <Text style={styles.statLbl}>Usuarios Asignados</Text>
          </View>
        </View>

        {/* Selector de Pestañas */}
        <View style={styles.tabNav}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'roles' && styles.tabBtnActive]}
            onPress={() => setActiveTab('roles')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'roles' && styles.tabBtnTextActive]}>
              🛡️ Roles y Matriz
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'register' && styles.tabBtnActive]}
            onPress={() => setActiveTab('register')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'register' && styles.tabBtnTextActive]}>
              ➕ Registrar Usuario
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'users' && styles.tabBtnActive]}
            onPress={() => setActiveTab('users')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'users' && styles.tabBtnTextActive]}>
              👥 Usuarios ({enterpriseUsers.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── CONTENIDO DINÁMICO POR PESTAÑA ──────────────────────────────── */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={THEME.roles.admin} />
          <Text style={styles.loadingText}>Sincronizando roles y permisos con Supabase...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ═══════════════════════════════════════════════════════════════════
              PESTAÑA 1: GESTIÓN DE ROLES EMPRESARIALES Y MATRIZ DE PERMISOS
             ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'roles' && (
            <View>
              {/* Botón de Creación */}
              <View style={styles.roleHeaderActions}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionHeaderTitle}>Nómina de Roles Configurados</Text>
                  <Text style={styles.sectionHeaderSub}>
                    Define el alcance de operaciones para cada área empresarial en EcoRuta
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.createRoleBtn}
                  onPress={handleOpenCreateRole}
                  activeOpacity={0.85}
                >
                  <Text style={styles.createRoleBtnText}>✨ Nuevo Rol</Text>
                </TouchableOpacity>
              </View>

              {roles.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyIcon}>🛡️</Text>
                  <Text style={styles.emptyTitle}>Aún no hay roles empresariales creados</Text>
                  <Text style={styles.emptySub}>
                    Presiona "Nuevo Rol" para crear el primero y definir su matriz de permisos.
                  </Text>
                </View>
              ) : (
                roles.map((role) => {
                  return (
                    <View key={role.id?.toString()} style={styles.roleCard}>
                      <View style={styles.roleCardHeader}>
                        <View style={{ flex: 1 }}>
                          <View style={styles.roleTitleRow}>
                            <Text style={styles.roleCardTitle}>{role.nombre}</Text>
                            <View style={styles.activePill}>
                              <Text style={styles.activePillText}>Activo</Text>
                            </View>
                          </View>
                          <Text style={styles.roleCardDesc}>
                            {role.descripcion || 'Sin descripción adicional de funciones.'}
                          </Text>
                        </View>

                        <View style={styles.roleHeaderBtns}>
                          <TouchableOpacity
                            style={styles.editRoleMiniBtn}
                            onPress={() => handleOpenEditRole(role)}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.editRoleMiniBtnText}>✏️ Editar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.delRoleMiniBtn}
                            onPress={() => handleDeleteRole(role)}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.delRoleMiniBtnText}>🗑️</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Matriz Compacta Visual de Permisos */}
                      <View style={styles.permMatrixBox}>
                        <Text style={styles.permMatrixTitle}>Matriz de Permisos por Módulo:</Text>
                        <View style={styles.permMatrixGrid}>
                          {ENTERPRISE_MODULES.map((mod) => {
                            const modPerm = (role.permisos || []).find(
                              (p) => (p.modulo || '').toLowerCase() === mod.key.toLowerCase()
                            );
                            const hasRead = Boolean(modPerm?.leer);
                            const hasWrite = Boolean(modPerm?.escribir);
                            const hasDelete = Boolean(modPerm?.borrar);

                            return (
                              <View key={mod.key} style={styles.permModuleRow}>
                                <View style={styles.modNameCol}>
                                  <Text style={styles.modIcon}>{mod.icon}</Text>
                                  <Text style={styles.modLabel}>{mod.key}</Text>
                                </View>

                                <View style={styles.actionsBadgesRow}>
                                  <View
                                    style={[
                                      styles.actionBadge,
                                      hasRead ? styles.actionBadgeRead : styles.actionBadgeOff,
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.actionBadgeText,
                                        hasRead ? styles.actionBadgeTextRead : styles.actionBadgeTextOff,
                                      ]}
                                    >
                                      👁️ Leer
                                    </Text>
                                  </View>

                                  <View
                                    style={[
                                      styles.actionBadge,
                                      hasWrite ? styles.actionBadgeWrite : styles.actionBadgeOff,
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.actionBadgeText,
                                        hasWrite ? styles.actionBadgeTextWrite : styles.actionBadgeTextOff,
                                      ]}
                                    >
                                      ✏️ Escribir
                                    </Text>
                                  </View>

                                  <View
                                    style={[
                                      styles.actionBadge,
                                      hasDelete ? styles.actionBadgeDelete : styles.actionBadgeOff,
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.actionBadgeText,
                                        hasDelete ? styles.actionBadgeTextDelete : styles.actionBadgeTextOff,
                                      ]}
                                    >
                                      🗑️ Borrar
                                    </Text>
                                  </View>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      </View>

                      {/* Pie de Tarjeta */}
                      <View style={styles.roleCardFooter}>
                        <TouchableOpacity
                          style={styles.assignUserShortcut}
                          onPress={() => {
                            setSelectedRoleId(role.id);
                            setActiveTab('register');
                          }}
                        >
                          <Text style={styles.assignUserShortcutText}>
                            ➕ Asignar nuevo usuario a este rol →
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              PESTAÑA 2: FORMULARIO DE REGISTRO DE USUARIO CON ROL EMPRESARIAL
             ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'register' && (
            <View style={styles.formContainerCard}>
              <View style={styles.formHeaderRow}>
                <View style={styles.formHeaderIconBadge}>
                  <Text style={styles.formHeaderIcon}>👤</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formTitle}>Registrar Usuario Empresarial</Text>
                  <Text style={styles.formSubtitle}>
                    Crea credenciales en Supabase Auth y vincula el perfil con roles y permisos.
                  </Text>
                </View>
              </View>

              {/* Selector de Modo: Directo Auth vs Invitación */}
              <View style={styles.modeToggleCard}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.modeToggleTitle}>
                    {useInviteMode ? 'Flujo de Invitación Corporativa' : 'Alta Directa en Supabase Auth'}
                  </Text>
                  <Text style={styles.modeToggleSub}>
                    {useInviteMode
                      ? 'Genera un token de invitación sin requerir confirmación por correo inmediata.'
                      : 'Crea el usuario directamente en el proveedor Supabase Auth de forma segura.'}
                  </Text>
                </View>
                <Switch
                  value={useInviteMode}
                  onValueChange={setUseInviteMode}
                  trackColor={{ false: '#CBD5E1', true: THEME.roles.admin }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {/* Campos del Formulario */}
              <Text style={styles.inputLabel}>Nombre Completo *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ej. Licda. Sofía Morales"
                placeholderTextColor="#94A3B8"
                value={userNombre}
                onChangeText={setUserNombre}
              />

              <Text style={styles.inputLabel}>Correo Electrónico Institucional *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="sofia.morales@ecoruta.com"
                placeholderTextColor="#94A3B8"
                value={userEmail}
                onChangeText={setUserEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <View style={styles.formRowTwoCols}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.inputLabel}>Contraseña Inicial *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Contraseña segura"
                    placeholderTextColor="#94A3B8"
                    value={userPassword}
                    onChangeText={setUserPassword}
                    secureTextEntry={false}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Teléfono de Contacto</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="+502 5555-5555"
                    placeholderTextColor="#94A3B8"
                    value={userTelefono}
                    onChangeText={setUserTelefono}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              {/* Selector de Rol Empresarial */}
              <Text style={styles.inputLabel}>Rol Empresarial Asignado *</Text>
              <Text style={styles.inputHint}>
                El colaborador heredará la matriz de permisos configurada para este rol:
              </Text>

              {roles.length === 0 ? (
                <View style={styles.warningBox}>
                  <Text style={styles.warningText}>
                    ⚠️ Aún no has creado ningún rol en la pestaña "Roles y Matriz". Por favor crea uno primero.
                  </Text>
                </View>
              ) : (
                <View style={styles.roleChipsGrid}>
                  {roles.map((r) => {
                    const isSelected = selectedRoleId === r.id;
                    return (
                      <TouchableOpacity
                        key={r.id?.toString()}
                        style={[styles.roleSelectCard, isSelected && styles.roleSelectCardActive]}
                        onPress={() => setSelectedRoleId(r.id)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.roleSelectRadioRow}>
                          <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                            {isSelected && <View style={styles.radioInner} />}
                          </View>
                          <Text
                            style={[
                              styles.roleSelectName,
                              isSelected && styles.roleSelectNameActive,
                            ]}
                          >
                            {r.nombre}
                          </Text>
                        </View>
                        <Text style={styles.roleSelectDesc} numberOfLines={2}>
                          {r.descripcion || 'Sin descripción'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Acceso Base del Sistema */}
              <Text style={styles.inputLabel}>Nivel de Acceso Base al Sistema *</Text>
              <View style={styles.baseRoleRow}>
                {[
                  { key: 'supervisor', label: '📋 Supervisor', desc: 'Acceso a paneles operativos y auditoría' },
                  { key: 'admin', label: '⚙️ Administrador', desc: 'Acceso directivo y de configuración' },
                ].map((b) => (
                  <TouchableOpacity
                    key={b.key}
                    style={[
                      styles.baseRoleBtn,
                      userBaseRole === b.key && styles.baseRoleBtnActive,
                    ]}
                    onPress={() => setUserBaseRole(b.key)}
                  >
                    <Text
                      style={[
                        styles.baseRoleBtnText,
                        userBaseRole === b.key && styles.baseRoleBtnTextActive,
                      ]}
                    >
                      {b.label}
                    </Text>
                    <Text style={styles.baseRoleBtnSub}>{b.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Departamento Institucional */}
              <Text style={styles.inputLabel}>Departamento / Área de Adscripción</Text>
              <View style={styles.deptChipsRow}>
                {[
                  'Logística y Cuadrillas',
                  'Finanzas y Canjes',
                  'Auditoría y Convenios',
                  'Operaciones Central',
                ].map((dept) => (
                  <TouchableOpacity
                    key={dept}
                    style={[
                      styles.deptChip,
                      userDept === dept && styles.deptChipActive,
                    ]}
                    onPress={() => setUserDept(dept)}
                  >
                    <Text
                      style={[
                        styles.deptChipText,
                        userDept === dept && styles.deptChipTextActive,
                      ]}
                    >
                      {dept}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Botón de Enviar */}
              <TouchableOpacity
                style={[
                  styles.submitUserBtn,
                  isRegisteringUser && styles.submitUserBtnDisabled,
                ]}
                onPress={handleRegisterUser}
                disabled={isRegisteringUser || roles.length === 0}
                activeOpacity={0.85}
              >
                {isRegisteringUser ? (
                  <View style={styles.btnRow}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.submitUserBtnText}> Registrando en Supabase...</Text>
                  </View>
                ) : (
                  <Text style={styles.submitUserBtnText}>
                    {useInviteMode ? '📨 Generar Invitación Empresarial' : '🚀 Registrar Usuario Empresarial'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              PESTAÑA 3: LISTADO DE USUARIOS EMPRESARIALES ACTIVOS
             ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'users' && (
            <View>
              <View style={styles.sectionHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionHeaderTitle}>Colaboradores Empresariales</Text>
                  <Text style={styles.sectionHeaderSub}>
                    Perfiles registrados con asignación de roles corporativos y supervisión
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.newUserTopBtn}
                  onPress={() => setActiveTab('register')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.newUserTopBtnText}>➕ Nuevo Usuario</Text>
                </TouchableOpacity>
              </View>

              {enterpriseUsers.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyIcon}>👥</Text>
                  <Text style={styles.emptyTitle}>Sin usuarios empresariales aún</Text>
                  <Text style={styles.emptySub}>
                    Usa la pestaña "Registrar Usuario" para dar de alta a miembros del equipo.
                  </Text>
                </View>
              ) : (
                enterpriseUsers.map((u) => {
                  const assignedRoleObj = roles.find(
                    (r) => r.id === u.rol_empresarial_id || r.nombre === u.rol_empresarial_nombre
                  );
                  return (
                    <View key={u.id?.toString()} style={styles.userCard}>
                      <View style={styles.userCardHeader}>
                        <View style={styles.userAvatar}>
                          <Text style={styles.userAvatarText}>
                            {(u.nombre_completo || 'U').charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.userNameRow}>
                            <Text style={styles.userNameText}>{u.nombre_completo || 'Colaborador'}</Text>
                            <View
                              style={[
                                styles.userStatusPill,
                                u.activo !== false ? styles.userStatusActive : styles.userStatusInactive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.userStatusText,
                                  u.activo !== false ? styles.userStatusTextActive : styles.userStatusTextInactive,
                                ]}
                              >
                                {u.activo !== false ? 'Activo' : 'Inactivo'}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.userEmailText}>{u.email || 'Sin correo'}</Text>
                        </View>
                      </View>

                      <View style={styles.userDetailsBox}>
                        <View style={styles.userDetailRow}>
                          <Text style={styles.userDetailLabel}>🛡️ Rol Empresarial:</Text>
                          <View style={styles.userRoleTag}>
                            <Text style={styles.userRoleTagText}>
                              {u.rol_empresarial_nombre || assignedRoleObj?.nombre || 'Supervisor ERP'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.userDetailRow}>
                          <Text style={styles.userDetailLabel}>🏢 Área / Depto:</Text>
                          <Text style={styles.userDetailVal}>
                            {u.departamento || 'Operaciones y Auditoría'}
                          </Text>
                        </View>
                        {Boolean(u.telefono) && (
                          <View style={styles.userDetailRow}>
                            <Text style={styles.userDetailLabel}>📞 Teléfono:</Text>
                            <Text style={styles.userDetailVal}>{u.telefono}</Text>
                          </View>
                        )}
                        {Boolean(u.invite_token) && (
                          <View style={styles.userDetailRow}>
                            <Text style={styles.userDetailLabel}>🎟️ Token Invitación:</Text>
                            <Text style={[styles.userDetailVal, { color: THEME.roles.admin, fontWeight: '700' }]}>
                              {u.invite_token}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* ─── MODAL DE GESTIÓN DE ROL CON MATRIZ DE CHECKBOXES ───────────── */}
      <Modal visible={isRoleModalOpen} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentLarge}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTag}>PANEL DE GESTIÓN DE ROLES</Text>
                <Text style={styles.modalTitle}>
                  {editingRoleId ? 'Editar Permisos del Rol' : 'Crear Nuevo Rol Empresarial'}
                </Text>
                <Text style={styles.modalSub}>
                  Configura los accesos modulares guardándolos en permisos_roles
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsRoleModalOpen(false)}
                disabled={isSavingRole}
              >
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '80%' }}>
              {/* Campos Básicos */}
              <Text style={styles.inputLabel}>Nombre del Rol *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ej. Auditor de Campo, Jefe de Finanzas..."
                placeholderTextColor="#94A3B8"
                value={roleName}
                onChangeText={setRoleName}
              />

              <Text style={styles.inputLabel}>Descripción del Cargo</Text>
              <TextInput
                style={[styles.textInput, { height: 60 }]}
                placeholder="Describe las responsabilidades del rol..."
                placeholderTextColor="#94A3B8"
                value={roleDesc}
                onChangeText={setRoleDesc}
                multiline
              />

              {/* MATRIZ INTERACTIVA DE CHECKBOXES (Requerimiento 2) */}
              <View style={styles.matrixContainer}>
                <View style={styles.matrixHeaderRow}>
                  <Text style={styles.matrixMainTitle}>
                    🎛️ Matriz de Permisos (leer / escribir / borrar)
                  </Text>
                  <Text style={styles.matrixMainSub}>
                    Selecciona individualmente los privilegios por cada módulo del sistema:
                  </Text>
                </View>

                {/* Presets Rápidos */}
                <View style={styles.presetsRow}>
                  <TouchableOpacity
                    style={styles.presetChip}
                    onPress={() => applyPreset('all')}
                  >
                    <Text style={styles.presetChipText}>⚡ Total</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.presetChip}
                    onPress={() => applyPreset('readonly')}
                  >
                    <Text style={styles.presetChipText}>👁️ Solo Leer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.presetChip}
                    onPress={() => applyPreset('logistics_lead')}
                  >
                    <Text style={styles.presetChipText}>🚛 Solo Logística</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.presetChip}
                    onPress={() => applyPreset('finance_lead')}
                  >
                    <Text style={styles.presetChipText}>💰 Solo Finanzas</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.presetChip}
                    onPress={() => applyPreset('clear')}
                  >
                    <Text style={[styles.presetChipText, { color: '#DC2626' }]}>🧹 Limpiar</Text>
                  </TouchableOpacity>
                </View>

                {/* TABLA INTERACTIVA DE CHECKBOXES */}
                <View style={styles.matrixTable}>
                  {/* Encabezado de la Tabla */}
                  <View style={styles.matrixTableHeader}>
                    <Text style={[styles.matrixColHeader, { flex: 1.8 }]}>Módulo</Text>
                    {PERMISSION_ACTIONS.map((act) => (
                      <View key={act.key} style={styles.matrixColHeaderAction}>
                        <Text style={styles.actionColTitle}>{act.icon} {act.label}</Text>
                      </View>
                    ))}
                    <Text style={[styles.matrixColHeader, { flex: 1, textAlign: 'center' }]}>Fila</Text>
                  </View>

                  {/* Filas por Módulo */}
                  {ENTERPRISE_MODULES.map((mod, idx) => {
                    const rowPerms = permissionMatrix[mod.key] || { leer: false, escribir: false, borrar: false };
                    const allCheckedInRow = rowPerms.leer && rowPerms.escribir && rowPerms.borrar;

                    return (
                      <View
                        key={mod.key}
                        style={[
                          styles.matrixTableRow,
                          idx % 2 === 0 && styles.matrixTableRowEven,
                        ]}
                      >
                        {/* Celda Nombre Módulo */}
                        <View style={{ flex: 1.8 }}>
                          <View style={styles.modTitleInline}>
                            <Text style={styles.modTableIcon}>{mod.icon}</Text>
                            <Text style={styles.modTableLabel}>{mod.key}</Text>
                          </View>
                          <Text style={styles.modTableDesc} numberOfLines={1}>
                            {mod.description}
                          </Text>
                        </View>

                        {/* Columnas de Checkboxes Interactivos */}
                        {PERMISSION_ACTIONS.map((act) => {
                          const isChecked = Boolean(rowPerms[act.key]);
                          return (
                            <TouchableOpacity
                              key={act.key}
                              style={styles.checkboxCell}
                              onPress={() => togglePermission(mod.key, act.key)}
                              activeOpacity={0.7}
                            >
                              <View
                                style={[
                                  styles.checkboxBox,
                                  isChecked && styles.checkboxBoxChecked,
                                ]}
                              >
                                {isChecked && <Text style={styles.checkIcon}>✓</Text>}
                              </View>
                              <Text
                                style={[
                                  styles.checkboxLabel,
                                  isChecked && styles.checkboxLabelChecked,
                                ]}
                              >
                                {act.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}

                        {/* Botón Rápido de Fila */}
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                          <TouchableOpacity
                            style={[
                              styles.rowQuickToggleBtn,
                              allCheckedInRow && styles.rowQuickToggleBtnActive,
                            ]}
                            onPress={() => toggleRowAll(mod.key, !allCheckedInRow)}
                          >
                            <Text
                              style={[
                                styles.rowQuickToggleBtnText,
                                allCheckedInRow && styles.rowQuickToggleBtnTextActive,
                              ]}
                            >
                              {allCheckedInRow ? '✕ Nada' : '✓ Todo'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Botones de Acción */}
              <View style={styles.modalActionsRow}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setIsRoleModalOpen(false)}
                  disabled={isSavingRole}
                >
                  <Text style={styles.modalCancelBtnText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalSaveBtn, isSavingRole && styles.modalSaveBtnDisabled]}
                  onPress={handleSaveRole}
                  disabled={isSavingRole}
                >
                  {isSavingRole ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalSaveBtnText}>
                      {editingRoleId ? '💾 Actualizar Permisos' : '✨ Crear y Guardar Rol'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL DE CONFIRMACIÓN DE USUARIO REGISTRADO / INVITACIÓN ──── */}
      <Modal visible={inviteModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardSuccess}>
            <View style={styles.successIconBadge}>
              <Text style={styles.successIcon}>🎉</Text>
            </View>
            <Text style={styles.successTitle}>
              {createdUserData?.method === 'invitacion_corporativa'
                ? '¡Invitación Generada!'
                : '¡Colaborador Registrado!'}
            </Text>
            <Text style={styles.successSubtitle}>
              El usuario fue vinculado en Supabase y tiene habilitados sus permisos modulares.
            </Text>

            <View style={styles.credentialCard}>
              <View style={styles.credRow}>
                <Text style={styles.credLabel}>👤 Colaborador:</Text>
                <Text style={styles.credVal}>{createdUserData?.nombre_completo}</Text>
              </View>
              <View style={styles.credRow}>
                <Text style={styles.credLabel}>📧 Correo:</Text>
                <Text style={styles.credVal}>{createdUserData?.email}</Text>
              </View>
              <View style={styles.credRow}>
                <Text style={styles.credLabel}>🛡️ Rol Empresarial:</Text>
                <Text style={[styles.credVal, { color: THEME.roles.admin, fontWeight: '800' }]}>
                  {createdUserData?.roleName}
                </Text>
              </View>
              <View style={styles.credRow}>
                <Text style={styles.credLabel}>🔑 Clave Inicial:</Text>
                <Text style={styles.credVal}>{createdUserData?.password}</Text>
              </View>
              {Boolean(createdUserData?.inviteCode) && (
                <View style={[styles.credRow, { marginTop: 6 }]}>
                  <Text style={styles.credLabel}>🎟️ Token Invitación:</Text>
                  <Text style={[styles.credVal, { color: '#059669', fontWeight: '800' }]}>
                    {createdUserData?.inviteCode}
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.modalDoneBtn}
              onPress={() => {
                setInviteModalVisible(false);
                setCreatedUserData(null);
                setActiveTab('users');
              }}
            >
              <Text style={styles.modalDoneBtnText}>Listo, Ver en Lista de Usuarios</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL DE ASISTENCIA SQL PARA SUPABASE ─────────────────────── */}
      <Modal visible={sqlModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentLarge}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTag}>ESQUEMA POSTGRESQL</Text>
                <Text style={styles.modalTitle}>Script DDL para Supabase</Text>
                <Text style={styles.modalSub}>
                  Tablas roles_empresariales, permisos_roles y columnas en perfiles
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
              <Text style={styles.sqlCodeText}>{getRolesTableSqlScript()}</Text>
            </ScrollView>

            <TouchableOpacity
              style={styles.modalDoneBtn}
              onPress={() => setSqlModalVisible(false)}
            >
              <Text style={styles.modalDoneBtnText}>Entendido</Text>
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
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    ...(Platform.OS === 'web' && {
      maxWidth: 1200,
      width: '100%',
      alignSelf: 'center',
    }),
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  headerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.roles.admin,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  sqlHelpBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sqlHelpBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  statLbl: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#CBD5E1',
    marginVertical: 2,
  },
  tabNav: {
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
    color: THEME.roles.admin,
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
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    ...(Platform.OS === 'web' && {
      maxWidth: 1200,
      width: '100%',
      alignSelf: 'center',
    }),
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  roleHeaderActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionHeaderSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  createRoleBtn: {
    backgroundColor: THEME.roles.admin,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    shadowColor: THEME.roles.admin,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  createRoleBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
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
    color: '#0F172A',
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
  roleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  roleCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  roleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  activePill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  roleCardDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  roleHeaderBtns: {
    flexDirection: 'row',
    gap: 6,
  },
  editRoleMiniBtn: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
  },
  editRoleMiniBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  delRoleMiniBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
  },
  delRoleMiniBtnText: {
    fontSize: 12,
  },
  permMatrixBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  permMatrixTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  permMatrixGrid: {
    gap: 6,
  },
  permModuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modNameCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  modIcon: {
    fontSize: 14,
  },
  modLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  actionsBadgesRow: {
    flexDirection: 'row',
    gap: 4,
  },
  actionBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  actionBadgeRead: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  actionBadgeWrite: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  actionBadgeDelete: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  actionBadgeOff: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
    opacity: 0.5,
  },
  actionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  actionBadgeTextRead: {
    color: '#1D4ED8',
  },
  actionBadgeTextWrite: {
    color: '#B45309',
  },
  actionBadgeTextDelete: {
    color: '#B91C1C',
  },
  actionBadgeTextOff: {
    color: '#94A3B8',
  },
  roleCardFooter: {
    marginTop: 10,
    alignItems: 'flex-end',
  },
  assignUserShortcut: {
    paddingVertical: 4,
  },
  assignUserShortcutText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.roles.admin,
  },

  // Formulario Usuario
  formContainerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  formHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  formHeaderIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formHeaderIcon: {
    fontSize: 20,
  },
  formTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  formSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
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
    marginBottom: 14,
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
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
    marginTop: 10,
  },
  inputHint: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 8,
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
  formRowTwoCols: {
    flexDirection: 'row',
  },
  roleChipsGrid: {
    gap: 8,
    marginBottom: 8,
  },
  roleSelectCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 10,
  },
  roleSelectCardActive: {
    backgroundColor: '#F5F3FF',
    borderColor: THEME.roles.admin,
  },
  roleSelectRadioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radioCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: THEME.roles.admin,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: THEME.roles.admin,
  },
  roleSelectName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  roleSelectNameActive: {
    color: THEME.roles.admin,
    fontWeight: '800',
  },
  roleSelectDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 3,
    marginLeft: 24,
  },
  baseRoleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  baseRoleBtn: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 10,
  },
  baseRoleBtnActive: {
    backgroundColor: '#F5F3FF',
    borderColor: THEME.roles.admin,
  },
  baseRoleBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  baseRoleBtnTextActive: {
    color: THEME.roles.admin,
  },
  baseRoleBtnSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
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
  submitUserBtn: {
    backgroundColor: THEME.roles.admin,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: THEME.roles.admin,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
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
  warningBox: {
    backgroundColor: '#FFFBEB',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  warningText: {
    fontSize: 12,
    color: '#B45309',
  },

  // Pestaña Usuarios
  newUserTopBtn: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  newUserTopBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.roles.admin,
  },
  userCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  userCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  userAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.roles.admin,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userNameText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  userStatusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  userStatusActive: {
    backgroundColor: '#DCFCE7',
  },
  userStatusInactive: {
    backgroundColor: '#FEE2E2',
  },
  userStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  userStatusTextActive: {
    color: '#15803D',
  },
  userStatusTextInactive: {
    color: '#B91C1C',
  },
  userEmailText: {
    fontSize: 12,
    color: '#64748B',
  },
  userDetailsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    gap: 4,
  },
  userDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userDetailLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  userDetailVal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  userRoleTag: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  userRoleTagText: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.roles.admin,
  },

  // Modales
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContentLarge: {
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
    color: THEME.roles.admin,
    letterSpacing: 0.5,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalCloseBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#94A3B8',
  },
  matrixContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  matrixHeaderRow: {
    marginBottom: 8,
  },
  matrixMainTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  matrixMainSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  presetChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  presetChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
  },
  matrixTable: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
  },
  matrixTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
  matrixColHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  matrixColHeaderAction: {
    flex: 1,
    alignItems: 'center',
  },
  actionColTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#334155',
  },
  matrixTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  matrixTableRowEven: {
    backgroundColor: '#FAFAFA',
  },
  modTitleInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modTableIcon: {
    fontSize: 14,
  },
  modTableLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  modTableDesc: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 2,
  },
  checkboxCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: THEME.roles.admin,
    borderColor: THEME.roles.admin,
  },
  checkIcon: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  checkboxLabel: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  checkboxLabelChecked: {
    color: THEME.roles.admin,
    fontWeight: '800',
  },
  rowQuickToggleBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
  },
  rowQuickToggleBtnActive: {
    backgroundColor: '#EDE9FE',
  },
  rowQuickToggleBtnText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#475569',
  },
  rowQuickToggleBtnTextActive: {
    color: THEME.roles.admin,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    marginBottom: 6,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    alignItems: 'center',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  modalSaveBtn: {
    flex: 1.5,
    paddingVertical: 12,
    backgroundColor: THEME.roles.admin,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalSaveBtnDisabled: {
    opacity: 0.7,
  },
  modalSaveBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Modal Éxito
  modalCardSuccess: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
  },
  successIconBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  successIcon: {
    fontSize: 26,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  successSubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
  },
  credentialCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    width: '100%',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    gap: 6,
  },
  credRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  credLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  credVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalDoneBtn: {
    backgroundColor: THEME.roles.admin,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'center',
  },
  modalDoneBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  sqlCodeBox: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    marginVertical: 12,
    maxHeight: 350,
  },
  sqlCodeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: '#38BDF8',
    lineHeight: 16,
  },
});

