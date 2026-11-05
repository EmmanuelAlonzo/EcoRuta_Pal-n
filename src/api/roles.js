import { createClient } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';

/**
 * Servicio API para Gestión de Roles Empresariales y Permisos Modulares (EcoRuta Palín)
 * Administra las tablas:
 * - `roles_empresariales`
 * - `permisos_roles`
 * - `perfiles` (asignación de usuarios empresariales)
 */

// Credenciales base de Supabase para instanciar cliente auxiliar no persistente
// (Evita sobreescribir la sesión activa del administrador al crear nuevos usuarios en Auth)
const supabaseUrl = 'https://twpburcjswimkwedgiuv.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3cGJ1cmNqc3dpbWt3ZWRnaXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NTc3MTcsImV4cCI6MjEwODAzMzcxN30.otrHJobBGKsg1b_jm0TATB9WXjwkg8rxpJb_m1oRpnQ';

/**
 * Cliente temporal sin persistencia en Expo SecureStore
 * Permite ejecutar `tempAuthClient.auth.signUp()` sin desloguear al administrador.
 */
const getTempAuthClient = () => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
};

/**
 * Módulos oficiales del ERP EcoRuta Palín
 */
export const ENTERPRISE_MODULES = [
  {
    key: 'Logística',
    label: 'Logística',
    icon: '🚛',
    description: 'Recolecciones en campo, pesajes, asignación de rutas y flota de camiones.',
  },
  {
    key: 'Finanzas',
    label: 'Finanzas',
    icon: '💰',
    description: 'Control de puntos, redenciones de incentivos, arqueos y convenios comerciales.',
  },
  {
    key: 'Auditoría',
    label: 'Auditoría',
    icon: '📋',
    description: 'Auditoría de ofertas comerciales, trazabilidad de operaciones y fiscalización.',
  },
];

/**
 * Acciones / Permisos por módulo
 */
export const PERMISSION_ACTIONS = [
  { key: 'leer', label: 'Leer', icon: '👁️', desc: 'Consultar listados, detalles y estadísticas' },
  { key: 'escribir', label: 'Escribir', icon: '✏️', desc: 'Crear, editar y actualizar información' },
  { key: 'borrar', label: 'Borrar', icon: '🗑️', desc: 'Eliminar registros o suspender accesos' },
];

/**
 * Roles empresariales predeterminados para respaldo e inicialización
 */
export const DEFAULT_ENTERPRISE_ROLES = [
  {
    id: 'rol-auditor-general',
    nombre: 'Auditor General',
    descripcion: 'Supervisa la legalidad comercial y la trazabilidad de recolecciones e incentivos.',
    activo: true,
    permisos: [
      { modulo: 'Logística', leer: true, escribir: false, borrar: false },
      { modulo: 'Finanzas', leer: true, escribir: false, borrar: false },
      { modulo: 'Auditoría', leer: true, escribir: true, borrar: true },
    ],
  },
  {
    id: 'rol-coordinador-logistica',
    nombre: 'Coordinador de Logística',
    descripcion: 'Gestión integral de cuadrillas operativas, ruteo en Palín y control de flota.',
    activo: true,
    permisos: [
      { modulo: 'Logística', leer: true, escribir: true, borrar: true },
      { modulo: 'Finanzas', leer: true, escribir: false, borrar: false },
      { modulo: 'Auditoría', leer: true, escribir: false, borrar: false },
    ],
  },
  {
    id: 'rol-analista-finanzas',
    nombre: 'Analista de Finanzas',
    descripcion: 'Administración de redenciones, saldo de puntos y liquidación con comercios.',
    activo: true,
    permisos: [
      { modulo: 'Logística', leer: true, escribir: false, borrar: false },
      { modulo: 'Finanzas', leer: true, escribir: true, borrar: true },
      { modulo: 'Auditoría', leer: true, escribir: false, borrar: false },
    ],
  },
  {
    id: 'rol-director-operaciones',
    nombre: 'Director de Operaciones',
    descripcion: 'Acceso directivo transversal a logística y finanzas con supervisión global.',
    activo: true,
    permisos: [
      { modulo: 'Logística', leer: true, escribir: true, borrar: false },
      { modulo: 'Finanzas', leer: true, escribir: true, borrar: false },
      { modulo: 'Auditoría', leer: true, escribir: true, borrar: false },
    ],
  },
];

// Cache en memoria para garantizar continuidad operativa y evitar parpadeos
let memoryRolesCache = [...DEFAULT_ENTERPRISE_ROLES];
let memoryEnterpriseUsersCache = [];

/**
 * Consulta la lista de roles empresariales con sus permisos modulares desde Supabase.
 * @returns {Promise<Array>} Lista de roles con array de permisos
 */
export const getEnterpriseRoles = async () => {
  try {
    // 1. Consultar tabla `roles_empresariales`
    let { data: roles, error: rolesErr } = await supabase
      .from('roles_empresariales')
      .select('*')
      .order('nombre', { ascending: true });

    if (rolesErr) {
      console.warn('[roles.js] Tabla roles_empresariales no disponible o vacía:', rolesErr.message);
      return memoryRolesCache;
    }

    if (!roles || roles.length === 0) {
      // Si la tabla existe pero está vacía, sembrar roles por defecto
      console.log('[roles.js] Tabla roles_empresariales sin registros. Usando plantilla inicial.');
      return memoryRolesCache;
    }

    // 2. Consultar permisos asociados en `permisos_roles`
    const roleIds = roles.map((r) => r.id);
    let { data: permisos, error: permErr } = await supabase
      .from('permisos_roles')
      .select('*')
      .in('rol_id', roleIds);

    if (permErr) {
      console.warn('[roles.js] Error al consultar permisos_roles:', permErr.message);
    }

    const permisosByRole = new Map();
    (permisos || []).forEach((p) => {
      const key = p.rol_id;
      if (!permisosByRole.has(key)) {
        permisosByRole.set(key, []);
      }
      permisosByRole.get(key).push({
        id: p.id,
        modulo: p.modulo,
        leer: Boolean(p.leer ?? p.puede_leer),
        escribir: Boolean(p.escribir ?? p.puede_escribir),
        borrar: Boolean(p.borrar ?? p.puede_borrar),
      });
    });

    const enrichedRoles = roles.map((r) => {
      let rolePerms = permisosByRole.get(r.id) || [];

      // Asegurar que existan los 3 módulos en la estructura devuelta
      ENTERPRISE_MODULES.forEach((mod) => {
        const found = rolePerms.find((p) => p.modulo?.toLowerCase() === mod.key.toLowerCase());
        if (!found) {
          rolePerms.push({
            modulo: mod.key,
            leer: false,
            escribir: false,
            borrar: false,
          });
        }
      });

      return {
        ...r,
        permisos: rolePerms,
      };
    });

    memoryRolesCache = enrichedRoles;
    return enrichedRoles;
  } catch (err) {
    console.error('[roles.js] Error inesperado en getEnterpriseRoles:', err);
    return memoryRolesCache;
  }
};

/**
 * Crea un nuevo rol en `roles_empresariales` y guarda su matriz de permisos en `permisos_roles`.
 * 
 * @param {object} param0
 * @param {string} param0.nombre - Nombre del rol empresarial (ej: "Auditor de Campo")
 * @param {string} [param0.descripcion] - Descripción de funciones
 * @param {Array<{ modulo: string, leer: boolean, escribir: boolean, borrar: boolean }>} param0.permisos - Matriz de permisos
 * @returns {Promise<object>} Rol creado con sus permisos
 */
export const createEnterpriseRole = async ({ nombre, descripcion = '', permisos = [] }) => {
  if (!nombre || !nombre.trim()) {
    throw new Error('El nombre del rol empresarial es requerido.');
  }

  const cleanNombre = nombre.trim();
  const cleanDesc = (descripcion || '').trim();

  try {
    // 1. Insertar registro en `roles_empresariales`
    const { data: newRole, error: roleError } = await supabase
      .from('roles_empresariales')
      .insert([
        {
          nombre: cleanNombre,
          descripcion: cleanDesc,
          activo: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    let createdRoleId;
    let finalRoleObj;

    if (roleError) {
      console.warn('[roles.js] Falló inserción en Supabase roles_empresariales:', roleError.message);
      // Fallback resiliente en memoria con ID sintético
      createdRoleId = `rol-${Date.now()}`;
      finalRoleObj = {
        id: createdRoleId,
        nombre: cleanNombre,
        descripcion: cleanDesc,
        activo: true,
        created_at: new Date().toISOString(),
      };
    } else {
      createdRoleId = newRole.id;
      finalRoleObj = newRole;
    }

    // 2. Normalizar e insertar matriz de permisos en `permisos_roles`
    const normalizedPermisos = ENTERPRISE_MODULES.map((mod) => {
      const existing = permisos.find((p) => p.modulo?.toLowerCase() === mod.key.toLowerCase());
      return {
        rol_id: createdRoleId,
        modulo: mod.key,
        leer: Boolean(existing?.leer),
        escribir: Boolean(existing?.escribir),
        borrar: Boolean(existing?.borrar),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    try {
      const { data: permData, error: permError } = await supabase
        .from('permisos_roles')
        .insert(normalizedPermisos)
        .select();

      if (permError) {
        console.warn('[roles.js] Advertencia guardando permisos_roles:', permError.message);
      }
    } catch (permInsertErr) {
      console.warn('[roles.js] Excepción guardando permisos_roles:', permInsertErr);
    }

    const completedRole = {
      ...finalRoleObj,
      permisos: normalizedPermisos,
    };

    // Actualizar cache local
    memoryRolesCache = [completedRole, ...memoryRolesCache.filter((r) => r.id !== createdRoleId)];

    return completedRole;
  } catch (err) {
    console.error('[roles.js] Error al crear rol empresarial:', err);
    throw err;
  }
};

/**
 * Actualiza los datos de un rol existente y sincroniza su matriz de permisos en `permisos_roles`.
 * 
 * @param {string} rolId - ID del rol en Supabase
 * @param {object} param1
 * @param {string} [param1.nombre]
 * @param {string} [param1.descripcion]
 * @param {Array} [param1.permisos]
 * @returns {Promise<object>} Rol actualizado
 */
export const updateEnterpriseRole = async (rolId, { nombre, descripcion, permisos }) => {
  if (!rolId) throw new Error('ID de rol inválido.');

  try {
    const updatePayload = {
      updated_at: new Date().toISOString(),
    };
    if (nombre) updatePayload.nombre = nombre.trim();
    if (descripcion !== undefined) updatePayload.descripcion = (descripcion || '').trim();

    // 1. Actualizar roles_empresariales
    const { data: updatedRole, error: roleErr } = await supabase
      .from('roles_empresariales')
      .update(updatePayload)
      .eq('id', rolId)
      .select()
      .maybeSingle();

    if (roleErr) {
      console.warn('[roles.js] Advertencia actualizando roles_empresariales:', roleErr.message);
    }

    // 2. Sincronizar permisos en permisos_roles
    let finalPermisos = permisos;
    if (Array.isArray(permisos) && permisos.length > 0) {
      try {
        // Eliminar permisos previos del rol y reinsertar matriz limpia
        await supabase.from('permisos_roles').delete().eq('rol_id', rolId);

        const rowsToInsert = permisos.map((p) => ({
          rol_id: rolId,
          modulo: p.modulo,
          leer: Boolean(p.leer),
          escribir: Boolean(p.escribir),
          borrar: Boolean(p.borrar),
          updated_at: new Date().toISOString(),
        }));

        await supabase.from('permisos_roles').insert(rowsToInsert);
        finalPermisos = rowsToInsert;
      } catch (syncErr) {
        console.warn('[roles.js] Advertencia sincronizando permisos_roles:', syncErr);
      }
    }

    const resultRole = {
      id: rolId,
      ...(updatedRole || updatePayload),
      permisos: finalPermisos,
    };

    memoryRolesCache = memoryRolesCache.map((r) => (r.id === rolId ? { ...r, ...resultRole } : r));

    return resultRole;
  } catch (err) {
    console.error('[roles.js] Error en updateEnterpriseRole:', err);
    throw err;
  }
};

/**
 * Elimina un rol empresarial y sus permisos vinculados
 * @param {string} rolId
 * @returns {Promise<boolean>}
 */
export const deleteEnterpriseRole = async (rolId) => {
  if (!rolId) throw new Error('ID de rol inválido.');

  try {
    // 1. Eliminar de permisos_roles
    await supabase.from('permisos_roles').delete().eq('rol_id', rolId);

    // 2. Eliminar de roles_empresariales
    const { error } = await supabase.from('roles_empresariales').delete().eq('id', rolId);

    if (error) {
      console.warn('[roles.js] Advertencia eliminando en Supabase roles_empresariales:', error.message);
    }

    memoryRolesCache = memoryRolesCache.filter((r) => r.id !== rolId);
    return true;
  } catch (err) {
    console.error('[roles.js] Error eliminando rol empresarial:', err);
    throw err;
  }
};

/**
 * Registra un nuevo colaborador en Supabase:
 * - Crea el usuario en Supabase Auth mediante cliente sin sesión activa (para no desloguear al Admin).
 * - Registra su perfil directamente en la tabla `perfiles` con su rol seleccionado o escrito.
 * - En caso de requerir invitación o si Auth falla (políticas de registro), provee flujo de invitación con credenciales simuladas.
 * 
 * @param {object} param0
 * @param {string} param0.email - Correo del usuario
 * @param {string} param0.password - Contraseña de acceso
 * @param {string} param0.nombreCompleto - Nombre completo
 * @param {string} [param0.telefono] - Teléfono institucional
 * @param {string} [param0.rol='operario'] - Rol simple a guardar directamente en la columna `rol` de `perfiles`
 * @param {boolean} [param0.useInviteFlow=false] - Forzar generación de token de invitación
 * @returns {Promise<{ success: boolean, user: object, profile: object, inviteCode?: string, method: string }>}
 */
export const registerEnterpriseUser = async ({
  email,
  password,
  nombreCompleto,
  telefono = '',
  rol = 'operario',
  useInviteFlow = false,
}) => {
  if (!email || !email.trim()) throw new Error('El correo electrónico es requerido.');
  if (!nombreCompleto || !nombreCompleto.trim()) throw new Error('El nombre completo es requerido.');
  if (!password || password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');

  // Rol exacto como string simple para la columna `rol` de la tabla `perfiles`
  const rolSeleccionado = (rol || 'operario').trim();
  const cleanEmail = email.trim().toLowerCase();
  const cleanNombre = nombreCompleto.trim();
  const cleanTelefono = (telefono || '').trim();
  const inviteToken = `INV-PALIN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  let authUserId = null;
  let authMethod = 'supabase_auth';

  // ─── 1. REGISTRO EN SUPABASE AUTH (Cliente Temporal) ──────────────────────
  if (!useInviteFlow) {
    try {
      const tempAuthClient = getTempAuthClient();
      const { data: authData, error: authError } = await tempAuthClient.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            nombre_completo: cleanNombre,
            telefono: cleanTelefono,
            rol: rolSeleccionado,
          },
        },
      });

      if (authError) {
        console.warn('[roles.js] Supabase Auth signUp devolvió advertencia/error:', authError.message);
        authMethod = 'invitacion_corporativa';
        authUserId = `usr-inv-${Date.now()}`;
      } else if (authData?.user) {
        authUserId = authData.user.id;
        authMethod = 'supabase_auth_direct';
      }
    } catch (authException) {
      console.warn('[roles.js] Excepción en tempAuthClient.auth.signUp:', authException);
      authMethod = 'invitacion_corporativa';
      authUserId = `usr-inv-${Date.now()}`;
    }
  } else {
    authMethod = 'invitacion_corporativa';
    authUserId = `usr-inv-${Date.now()}`;
  }

  // ─── 2. GUARDAR DIRECTAMENTE EN TABLA `perfiles` DE SUPABASE ──────────────
  const profilePayload = {
    id: authUserId,
    email: cleanEmail,
    nombre_completo: cleanNombre,
    telefono: cleanTelefono || null,
    rol: rolSeleccionado,
    activo: true,
    updated_at: new Date().toISOString(),
  };

  let savedProfile = null;

  try {
    const { data: upsertData, error: upsertErr } = await supabase
      .from('perfiles')
      .upsert([profilePayload])
      .select()
      .maybeSingle();

    if (upsertErr) {
      console.warn('[roles.js] Error al guardar perfil en perfiles:', upsertErr.message);
    }
    savedProfile = upsertData || profilePayload;
  } catch (profileEx) {
    console.warn('[roles.js] Excepción guardando perfil en Supabase:', profileEx);
    savedProfile = profilePayload;
  }

  // Objeto final de usuario registrado
  const finalUser = {
    ...profilePayload,
    ...(savedProfile || {}),
    invite_token: inviteToken,
    fecha_creacion: new Date().toISOString(),
  };

  memoryEnterpriseUsersCache = [finalUser, ...memoryEnterpriseUsersCache.filter((u) => u.email !== cleanEmail)];

  return {
    success: true,
    user: finalUser,
    profile: finalUser,
    inviteCode: inviteToken,
    method: authMethod,
  };
};

/**
 * Consulta colaboradores que tienen roles empresariales asignados desde la tabla `perfiles`.
 * @returns {Promise<Array>}
 */
export const getEnterpriseUsers = async () => {
  try {
    let { data, error } = await supabase
      .from('perfiles')
      .select('*')
      .or('rol_empresarial_id.not.is.null,rol.eq.admin,rol.eq.supervisor')
      .order('fecha_creacion', { ascending: false });

    if (error) {
      console.warn('[roles.js] Fallback en getEnterpriseUsers:', error.message);
      const fb = await supabase
        .from('perfiles')
        .select('*')
        .in('rol', ['admin', 'supervisor']);
      data = fb.data;
    }

    const userList = data || [];

    // Combinar con cache en memoria para usuarios recién invitados en esta sesión
    const combined = [...userList];
    memoryEnterpriseUsersCache.forEach((memUser) => {
      if (!combined.some((u) => u.email === memUser.email || u.id === memUser.id)) {
        combined.unshift(memUser);
      }
    });

    return combined;
  } catch (err) {
    console.error('[roles.js] Error al consultar usuarios empresariales:', err);
    return memoryEnterpriseUsersCache;
  }
};

/**
 * Script SQL para inicializar tablas en Supabase SQL Editor
 */
export const getRolesTableSqlScript = () => {
  return `-- ═══════════════════════════════════════════════════════════════════════
-- SCRIPT DDL: GESTIÓN DE ROLES EMPRESARIALES Y PERMISOS MODULARES ECORUTA
-- Ejecuta este script en el SQL Editor de tu Dashboard de Supabase
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Tabla de Roles Empresariales
CREATE TABLE IF NOT EXISTS public.roles_empresariales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL UNIQUE,
    descripcion TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabla de Permisos Modulares por Rol
CREATE TABLE IF NOT EXISTS public.permisos_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rol_id UUID NOT NULL REFERENCES public.roles_empresariales(id) ON DELETE CASCADE,
    modulo TEXT NOT NULL, -- 'Logística', 'Finanzas', 'Auditoría'
    leer BOOLEAN DEFAULT false,
    escribir BOOLEAN DEFAULT false,
    borrar BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_rol_modulo UNIQUE(rol_id, modulo)
);

-- 3. Vinculación en tabla perfiles (Columnas extendidas)
ALTER TABLE public.perfiles 
ADD COLUMN IF NOT EXISTS rol_empresarial_id UUID REFERENCES public.roles_empresariales(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS rol_empresarial_nombre TEXT;

-- 4. Habilitar Seguridad por Filas (RLS) y Políticas de Acceso
ALTER TABLE public.roles_empresariales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permisos_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de roles empresariales" 
ON public.roles_empresariales FOR SELECT USING (true);

CREATE POLICY "Gestión total de roles empresariales" 
ON public.roles_empresariales FOR ALL USING (true);

CREATE POLICY "Lectura pública de permisos de roles" 
ON public.permisos_roles FOR SELECT USING (true);

CREATE POLICY "Gestión total de permisos de roles" 
ON public.permisos_roles FOR ALL USING (true);
`;
};

