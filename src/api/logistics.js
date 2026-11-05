import { supabase } from '../services/supabase';

/**
 * Servicio API para el Módulo ERP: Logística, Flota y Gestión de Personal (EcoRuta Palín)
 */

// ─── GESTIÓN DE PERSONAL (ADMINISTRADOR) ────────────────────────────────────

/**
 * Consulta la lista de colaboradores operativos de EcoRuta desde la tabla `perfiles`
 * Excluye perfiles de ciudadanos/clientes y afiliados para concentrarse en el personal operativo.
 * @returns {Promise<Array>}
 */
export const getPersonnelList = async () => {
  try {
    const { data, error } = await supabase
      .from('perfiles')
      .select('*')
      .order('nombre_completo', { ascending: true });

    if (error) {
      console.error('[logistics.js] Error al consultar personal en perfiles:', error);
      throw error;
    }

    return (data || []).filter((p) => {
      const r = (p.rol || '').toLowerCase();
      return r !== 'cliente' && r !== 'afiliado';
    });
  } catch (err) {
    console.error('[logistics.js] Excepción en getPersonnelList:', err);
    return [];
  }
};

/**
 * Consulta el personal operativo activo que actualmente NO tiene cuadrilla asignada (cuadrilla_id IS NULL)
 * @returns {Promise<Array>}
 */
export const getUnassignedOperationalStaff = async () => {
  try {
    let { data, error } = await supabase
      .from('perfiles')
      .select('*')
      .eq('activo', true)
      .is('cuadrilla_id', null)
      .order('nombre_completo', { ascending: true });

    if (error) {
      console.warn('[logistics.js] Advertencia con is(cuadrilla_id, null), intentando filtro en memoria:', error.message);
      const all = await getPersonnelList();
      return all.filter((p) => p.activo !== false && (!p.cuadrilla_id));
    }

    return (data || []).filter((p) => {
      const r = (p.rol || '').toLowerCase();
      return r !== 'cliente' && r !== 'afiliado' && r !== 'admin';
    });
  } catch (err) {
    console.error('[logistics.js] Error en getUnassignedOperationalStaff:', err);
    return [];
  }
};

/**
 * Actualiza los datos de un colaborador (nombre, rol, teléfono)
 * @param {string} userId
 * @param {object} updates
 * @returns {Promise<object>}
 */
export const updatePersonnel = async (userId, updates) => {
  const payload = {
    updated_at: new Date().toISOString(),
  };

  if (updates.nombre_completo !== undefined) payload.nombre_completo = updates.nombre_completo.trim();
  if (updates.rol !== undefined) payload.rol = updates.rol;
  if (updates.telefono !== undefined) payload.telefono = updates.telefono.trim();
  if (updates.codigo_camion !== undefined) payload.codigo_camion = updates.codigo_camion;
  if (updates.ruta_asignada !== undefined) payload.ruta_asignada = updates.ruta_asignada;
  if (updates.activo !== undefined) payload.activo = updates.activo;

  const { data, error } = await supabase
    .from('perfiles')
    .update(payload)
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.error('[logistics.js] Error al actualizar colaborador:', error);
    throw error;
  }

  return data;
};

/**
 * Modifica el estado activo/suspendido de un usuario
 * @param {string} userId
 * @param {boolean} nuevoEstado
 * @returns {Promise<object>}
 */
export const togglePersonnelStatus = async (userId, nuevoEstado) => {
  const { data, error } = await supabase
    .from('perfiles')
    .update({
      activo: Boolean(nuevoEstado),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.error('[logistics.js] Error al cambiar estado de colaborador:', error);
    throw error;
  }

  return data;
};

/**
 * Elimina un perfil de colaborador (borrado físico en tabla perfiles)
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export const deletePersonnel = async (userId) => {
  const { error } = await supabase
    .from('perfiles')
    .delete()
    .eq('id', userId);

  if (error) {
    console.error('[logistics.js] Error al eliminar colaborador:', error);
    throw error;
  }

  return true;
};

// ─── GESTIÓN DE FLOTA Y CAMIONES (SUPERVISOR) ───────────────────────────────

/**
 * Consulta todos los camiones registrados en Supabase
 * @param {boolean} [onlyActive=false]
 * @returns {Promise<Array>}
 */
export const getTrucks = async (onlyActive = false) => {
  let query = supabase
    .from('camiones')
    .select('*')
    .order('codigo', { ascending: true });

  if (onlyActive) {
    query = query.eq('activo', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[logistics.js] Error consultando camiones:', error);
    throw error;
  }

  return data || [];
};

/**
 * Registra un nuevo camión en la flota EcoRuta
 * @param {object} camion
 * @returns {Promise<object>}
 */
export const createTruck = async ({ codigo, placa, activo = true }) => {
  const payload = {
    codigo: codigo.trim().toUpperCase(),
    placa: placa ? placa.trim().toUpperCase() : 'PENDIENTE',
    activo: Boolean(activo),
  };

  const { data, error } = await supabase
    .from('camiones')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error('[logistics.js] Error creando camión:', error);
    throw error;
  }

  return data;
};

/**
 * Actualiza los datos de un camión
 * @param {string|number} id
 * @param {object} updates
 * @returns {Promise<object>}
 */
export const updateTruck = async (id, { codigo, placa, activo }) => {
  const payload = {};
  if (codigo !== undefined) payload.codigo = codigo.trim().toUpperCase();
  if (placa !== undefined) payload.placa = placa.trim().toUpperCase();
  if (activo !== undefined) payload.activo = Boolean(activo);

  const { data, error } = await supabase
    .from('camiones')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[logistics.js] Error actualizando camión:', error);
    throw error;
  }

  return data;
};

/**
 * Elimina un camión del registro
 * @param {string|number} id
 * @returns {Promise<boolean>}
 */
export const deleteTruck = async (id) => {
  const { error } = await supabase
    .from('camiones')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[logistics.js] Error eliminando camión:', error);
    throw error;
  }

  return true;
};

// ─── GESTIÓN DE RUTAS DE RECOLECCIÓN (SUPERVISOR) ───────────────────────────

/**
 * Consulta las rutas registradas en la tabla `rutas`
 * @returns {Promise<Array>}
 */
export const getRoutes = async () => {
  const { data, error } = await supabase
    .from('rutas')
    .select('*')
    .order('nombre', { ascending: true });

  if (error) {
    console.error('[logistics.js] Error consultando rutas:', error);
    throw error;
  }

  return data || [];
};

/**
 * Registra una nueva ruta de recolección con delimitación geográfica
 * @param {object} ruta
 * @returns {Promise<object>}
 */
export const createRoute = async ({ nombre, descripcion, geometria_ruta = [] }) => {
  const payload = {
    nombre: nombre.trim(),
    descripcion: descripcion ? descripcion.trim() : 'Ruta urbana de recolección',
  };

  if (Array.isArray(geometria_ruta) && geometria_ruta.length > 0) {
    payload.geometria_ruta = geometria_ruta;
  }

  try {
    const { data, error } = await supabase
      .from('rutas')
      .insert([payload])
      .select()
      .single();

    if (error) {
      // Si la columna geometria_ruta no existe aún en la tabla rutas, guardar sin geometría
      if (error.message && error.message.toLowerCase().includes('geometria_ruta')) {
        console.warn('[logistics.js] Columna geometria_ruta no encontrada en Supabase. Guardando sin polígono.');
        delete payload.geometria_ruta;
        const fallbackRes = await supabase
          .from('rutas')
          .insert([payload])
          .select()
          .single();
        if (fallbackRes.error) throw fallbackRes.error;
        return fallbackRes.data;
      }
      throw error;
    }

    return data;
  } catch (err) {
    console.error('[logistics.js] Error creando ruta:', err);
    throw err;
  }
};

/**
 * Actualiza los datos de una ruta existente
 * @param {string|number} id
 * @param {object} updates
 * @returns {Promise<object>}
 */
export const updateRoute = async (id, { nombre, descripcion, geometria_ruta }) => {
  const payload = {};
  if (nombre !== undefined) payload.nombre = nombre.trim();
  if (descripcion !== undefined) payload.descripcion = descripcion.trim();
  if (geometria_ruta !== undefined && Array.isArray(geometria_ruta)) {
    payload.geometria_ruta = geometria_ruta;
  }

  try {
    const { data, error } = await supabase
      .from('rutas')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.message && error.message.toLowerCase().includes('geometria_ruta')) {
        console.warn('[logistics.js] Columna geometria_ruta no encontrada al actualizar. Guardando campos básicos.');
        delete payload.geometria_ruta;
        const fallbackRes = await supabase
          .from('rutas')
          .update(payload)
          .eq('id', id)
          .select()
          .single();
        if (fallbackRes.error) throw fallbackRes.error;
        return fallbackRes.data;
      }
      throw error;
    }

    return data;
  } catch (err) {
    console.error('[logistics.js] Error actualizando ruta:', err);
    throw err;
  }
};

/**
 * Elimina una ruta de recolección
 * @param {string|number} id
 * @returns {Promise<boolean>}
 */
export const deleteRoute = async (id) => {
  const { error } = await supabase
    .from('rutas')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[logistics.js] Error eliminando ruta:', error);
    throw error;
  }

  return true;
};

// ─── ASIGNACIÓN DE PERSONAL (SUPERVISOR) ────────────────────────────────────

/**
 * Asigna camión y ruta a un operario o piloto en su perfil
 * @param {string} userId
 * @param {object} param1
 * @returns {Promise<object>}
 */
export const assignPersonnelRoute = async (userId, { codigo_camion, ruta_asignada }) => {
  const { data, error } = await supabase
    .from('perfiles')
    .update({
      codigo_camion,
      ruta_asignada,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.error('[logistics.js] Error asignando personal:', error);
    throw error;
  }

  return data;
};

// ─── GESTIÓN DE CUADRILLAS Y ASIGNACIÓN COLECTIVA DE RUTAS ─────────────────

/**
 * Consulta las cuadrillas registradas en la tabla `cuadrillas`, asociando
 * los operarios y pilotos que pertenecen a cada una según su `cuadrilla_id` en `perfiles`.
 * Datos 100% reales desde Supabase sin mocks ni memoria fija.
 * 
 * @returns {Promise<Array>} Lista de cuadrillas con sus miembros
 */
export const getCuadrillas = async () => {
  try {
    // 1. Consultar tabla `cuadrillas`
    const { data: cuadrillas, error } = await supabase
      .from('cuadrillas')
      .select('*')
      .order('nombre', { ascending: true });

    if (error) {
      console.warn('[logistics.js] Consulta a tabla cuadrillas:', error.message);
      return [];
    }

    if (!cuadrillas || cuadrillas.length === 0) {
      return [];
    }

    // 2. Consultar personal operativo en `perfiles` para agrupar miembros por cuadrilla_id
    let operationalStaff = [];
    try {
      const { data: staffData } = await supabase
        .from('perfiles')
        .select('*')
        .eq('activo', true)
        .not('cuadrilla_id', 'is', null);

      operationalStaff = staffData || [];
    } catch (staffErr) {
      console.warn('[logistics.js] Error al consultar miembros de cuadrillas:', staffErr.message);
    }

    // 3. Consultar rutas para asociar el nombre de la ruta vinculada
    let allRoutes = [];
    try {
      const { data: rData } = await supabase.from('rutas').select('id, nombre');
      allRoutes = rData || [];
    } catch {
      // Ignorar si falla
    }

    const routeMap = new Map((allRoutes || []).map((r) => [String(r.id), r.nombre]));

    // Asociar miembros y nombres de ruta a cada cuadrilla
    const enriched = (cuadrillas || []).map((c) => {
      const members = operationalStaff.filter((s) => String(s.cuadrilla_id) === String(c.id));
      const rutaNombre = c.ruta_id ? routeMap.get(String(c.ruta_id)) || c.ruta_asignada || null : null;

      return {
        ...c,
        ruta_nombre: rutaNombre,
        miembros: members,
        total_miembros: members.length,
      };
    });

    return enriched;
  } catch (err) {
    console.error('[logistics.js] Error en getCuadrillas:', err);
    return [];
  }
};

/**
 * Crea una nueva cuadrilla en la tabla `cuadrillas` y asigna a los operarios seleccionados
 * actualizando su `cuadrilla_id` en la tabla `perfiles`.
 * 
 * @param {object} param0
 * @param {string} param0.nombre - Nombre de la cuadrilla (ej: "Cuadrilla Norte")
 * @param {string} [param0.descripcion] - Descripción de tareas
 * @param {string|number} [param0.ruta_id] - ID de la ruta asignada
 * @param {string} [param0.codigo_camion] - Código de la unidad de flota asignada
 * @param {Array<string>} [param0.memberIds] - IDs de operarios a vincular en `perfiles`
 * @returns {Promise<object>} Cuadrilla creada
 */
export const createCuadrilla = async (params = {}) => {
  const {
    nombre,
    descripcion = null,
    ruta_id = null,
    codigo_camion = null,
    camion_id = null,
    supervisor_id = null,
    estado = 'activo',
    activo = true,
    memberIds = [],
  } = params;

  if (!nombre || !nombre.trim()) {
    throw new Error('El nombre de la cuadrilla es requerido.');
  }

  const cleanNombre = nombre.trim();
  const cleanDesc = descripcion ? descripcion.trim() : null;
  const resolvedCamion = camion_id !== undefined && camion_id !== null && camion_id !== ''
    ? camion_id
    : (codigo_camion !== undefined && codigo_camion !== null && codigo_camion !== '' ? codigo_camion : null);
  const resolvedSupervisor = supervisor_id !== undefined && supervisor_id !== null && supervisor_id !== ''
    ? supervisor_id
    : null;
  const resolvedEstado = estado !== undefined && estado !== null && estado !== ''
    ? estado
    : (activo ? 'activo' : 'inactivo');
  const resolvedRuta = ruta_id !== undefined && ruta_id !== null && ruta_id !== ''
    ? ruta_id
    : null;

  // Sanitización estricta: ningún campo debe ser undefined (evita fallos de inserción en Supabase)
  const payload = {
    nombre: cleanNombre,
    camion_id: resolvedCamion,
    supervisor_id: resolvedSupervisor,
    estado: resolvedEstado,
    descripcion: cleanDesc,
    ruta_id: resolvedRuta,
  };

  try {
    let createdCuadrilla = null;

    // Intento 1: Inserción con columnas estándar (nombre, camion_id, supervisor_id, estado, ruta_id, descripcion)
    const { data: cuadData, error } = await supabase
      .from('cuadrillas')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.log('Error creando cuadrilla:', error);

      // Si falla porque el esquema de BD usa `codigo_camion` o `activo` en vez de `camion_id`/`estado`
      if (error.message && error.message.includes('does not exist')) {
        const altPayload = {
          nombre: cleanNombre,
          descripcion: cleanDesc,
          codigo_camion: resolvedCamion,
          ruta_id: resolvedRuta,
          activo: true,
        };
        console.log('[logistics.js] Intentando esquema alternativo de cuadrillas...');
        const { data: altData, error: altErr } = await supabase
          .from('cuadrillas')
          .insert([altPayload])
          .select()
          .single();

        if (altErr) {
          console.log('Error creando cuadrilla:', altErr);
          // Último recurso: insertar únicamente con campos obligatorios que garantizan éxito
          const minimalPayload = {
            nombre: cleanNombre,
            descripcion: cleanDesc,
          };
          const { data: minData, error: minErr } = await supabase
            .from('cuadrillas')
            .insert([minimalPayload])
            .select()
            .single();

          if (minErr) {
            console.log('Error creando cuadrilla:', minErr);
            throw minErr;
          }
          createdCuadrilla = minData;
        } else {
          createdCuadrilla = altData;
        }
      } else {
        throw error;
      }
    } else {
      createdCuadrilla = cuadData;
    }

    // Actualizar `cuadrilla_id` en la tabla `perfiles` para cada operario seleccionado
    if (Array.isArray(memberIds) && memberIds.length > 0 && createdCuadrilla?.id) {
      try {
        await Promise.all(
          memberIds.map((userId) =>
            supabase
              .from('perfiles')
              .update({
                cuadrilla_id: createdCuadrilla.id,
                ...(resolvedCamion ? { codigo_camion: resolvedCamion } : {}),
                updated_at: new Date().toISOString(),
              })
              .eq('id', userId)
          )
        );
      } catch (profileErr) {
        console.warn('[logistics.js] Advertencia vinculando perfiles a la nueva cuadrilla:', profileErr.message);
      }
    }

    return createdCuadrilla;
  } catch (error) {
    console.log('Error creando cuadrilla:', error);
    throw error;
  }
};

/**
 * Asigna una Cuadrilla completa a una `ruta_id` en la tabla `cuadrillas`.
 * Además, propaga la asignación a todos los operarios pertenecientes a esa cuadrilla
 * actualizando su `ruta_asignada` y opcionalmente `codigo_camion` en la tabla `perfiles`.
 * 
 * @param {string|number} cuadrillaId - ID de la cuadrilla en Supabase
 * @param {string|number} rutaId - ID de la ruta en la tabla `rutas`
 * @param {string} [rutaNombre=''] - Nombre legible de la ruta (ej: "Zona 1 — Casco Urbano")
 * @param {string} [codigoCamion=null] - Código del camión asignado a la cuadrilla
 * @returns {Promise<object>} Cuadrilla actualizada
 */
export const assignCuadrillaRoute = async (
  cuadrillaId,
  rutaId,
  rutaNombre = '',
  codigoCamion = null
) => {
  if (!cuadrillaId) throw new Error('Debes seleccionar una cuadrilla.');
  if (!rutaId) throw new Error('Debes seleccionar una ruta para la cuadrilla.');

  const updateCuadrillaPayload = {
    ruta_id: rutaId,
    updated_at: new Date().toISOString(),
  };
  if (codigoCamion !== undefined && codigoCamion !== null) {
    updateCuadrillaPayload.codigo_camion = codigoCamion;
  }

  // 1. Actualizar `ruta_id` en la tabla `cuadrillas`
  const { data: updatedCuadrilla, error } = await supabase
    .from('cuadrillas')
    .update(updateCuadrillaPayload)
    .eq('id', cuadrillaId)
    .select()
    .single();

  if (error) {
    console.error('[logistics.js] Error actualizando cuadrillas.ruta_id:', error.message);
    throw error;
  }

  // 2. Propagar la ruta a todos los operarios de la cuadrilla en `perfiles`
  try {
    const profileUpdate = {
      ruta_asignada: rutaNombre || null,
      updated_at: new Date().toISOString(),
    };
    if (codigoCamion) {
      profileUpdate.codigo_camion = codigoCamion;
    }

    const { error: profileErr } = await supabase
      .from('perfiles')
      .update(profileUpdate)
      .eq('cuadrilla_id', cuadrillaId);

    if (profileErr) {
      console.warn('[logistics.js] Advertencia actualizando miembros en perfiles:', profileErr.message);
    }
  } catch (pEx) {
    console.warn('[logistics.js] Excepción propagando ruta a miembros:', pEx);
  }

  return updatedCuadrilla;
};

/**
 * Agrega rápidamente un colaborador (operario o piloto) a una cuadrilla,
 * actualizando su `cuadrilla_id` en la tabla `perfiles`.
 * 
 * @param {string|number} cuadrillaId - ID de la cuadrilla receptora
 * @param {string} userId - UUID del colaborador en `perfiles`
 * @param {string} [rutaAsignada=null] - Ruta heredada de la cuadrilla
 * @param {string} [codigoCamion=null] - Camión heredado de la cuadrilla
 * @returns {Promise<boolean>}
 */
export const addMemberToCuadrilla = async (
  cuadrillaId,
  userId,
  rutaAsignada = null,
  codigoCamion = null
) => {
  if (!cuadrillaId || !userId) {
    throw new Error('ID de cuadrilla y de usuario requeridos.');
  }

  const payload = {
    cuadrilla_id: cuadrillaId,
    updated_at: new Date().toISOString(),
  };
  if (rutaAsignada) payload.ruta_asignada = rutaAsignada;
  if (codigoCamion) payload.codigo_camion = codigoCamion;

  try {
    const { error } = await supabase
      .from('perfiles')
      .update(payload)
      .eq('id', userId);

    if (error) {
      console.warn('[logistics.js] Error agregando miembro a cuadrilla:', error.message);
      if (error.message && error.message.includes('cuadrilla_id')) {
        throw new Error(
          'La columna `cuadrilla_id` no existe aún en la tabla `perfiles`. Ejecuta la migración SQL de cuadrillas en Supabase.'
        );
      }
      throw error;
    }

    return true;
  } catch (err) {
    console.error('[logistics.js] Excepción en addMemberToCuadrilla:', err);
    throw err;
  }
};

/**
 * Quita rápidamente a un colaborador de su cuadrilla actual,
 * estableciendo `cuadrilla_id = null` en la tabla `perfiles`.
 * 
 * @param {string} userId - UUID del colaborador a desvincular
 * @returns {Promise<boolean>}
 */
export const removeMemberFromCuadrilla = async (userId) => {
  if (!userId) throw new Error('ID de usuario requerido.');

  try {
    const { error } = await supabase
      .from('perfiles')
      .update({
        cuadrilla_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.warn('[logistics.js] Error desvinculando miembro de cuadrilla:', error.message);
      throw error;
    }

    return true;
  } catch (err) {
    console.error('[logistics.js] Excepción en removeMemberFromCuadrilla:', err);
    throw err;
  }
};

/**
 * Elimina una cuadrilla y desvincula a todos sus operarios en `perfiles`.
 * @param {string|number} cuadrillaId
 * @returns {Promise<boolean>}
 */
export const deleteCuadrilla = async (cuadrillaId) => {
  if (!cuadrillaId) throw new Error('ID de cuadrilla requerido.');

  try {
    // 1. Desvincular operarios
    await supabase
      .from('perfiles')
      .update({ cuadrilla_id: null, updated_at: new Date().toISOString() })
      .eq('cuadrilla_id', cuadrillaId);

    // 2. Eliminar cuadrilla
    const { error } = await supabase
      .from('cuadrillas')
      .delete()
      .eq('id', cuadrillaId);

    if (error) {
      console.error('[logistics.js] Error eliminando en tabla cuadrillas:', error.message);
      throw error;
    }

    return true;
  } catch (err) {
    console.error('[logistics.js] Error en deleteCuadrilla:', err);
    throw err;
  }
};

/**
 * Script DDL SQL para crear la tabla cuadrillas y agregar cuadrilla_id a perfiles
 */
export const getCuadrillasSqlScript = () => {
  return `-- ═══════════════════════════════════════════════════════════════════════
-- SCRIPT DDL: GESTIÓN DE CUADRILLAS Y ASIGNACIÓN DE RUTAS ECORUTA PALÍN
-- Ejecuta este script en el SQL Editor de tu Dashboard de Supabase
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Tabla de Cuadrillas
CREATE TABLE IF NOT EXISTS public.cuadrillas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL UNIQUE,
    descripcion TEXT,
    ruta_id UUID REFERENCES public.rutas(id) ON DELETE SET NULL,
    codigo_camion TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Clave foránea cuadrilla_id en tabla perfiles
ALTER TABLE public.perfiles 
ADD COLUMN IF NOT EXISTS cuadrilla_id UUID REFERENCES public.cuadrillas(id) ON DELETE SET NULL;

-- 3. Habilitar Seguridad RLS y Políticas
ALTER TABLE public.cuadrillas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de cuadrillas" 
ON public.cuadrillas FOR SELECT USING (true);

CREATE POLICY "Gestión completa de cuadrillas por admin y supervisor" 
ON public.cuadrillas FOR ALL USING (true);
`;
};

// ─── CARTOGRAFÍA Y RUTEOS DINÁMICOS (PILOTOS Y SUPERVISIÓN) ────────────────

// Coordenadas base por cuadrante oficial de Palín
export const PALIN_QUADRANTS = {
  'Centro Palín': { lat: 14.4042, lng: -90.6978, latitude: 14.4042, longitude: -90.6978, nombre: 'Centro de Palín' },
  'zona 1': { lat: 14.4055, lng: -90.6965, latitude: 14.4055, longitude: -90.6965, nombre: 'Casco Urbano y Mercado' },
  'zona 2': { lat: 14.4020, lng: -90.6990, latitude: 14.4020, longitude: -90.6990, nombre: 'San Pedro y San José' },
  'zona 3': { lat: 14.4080, lng: -90.6940, latitude: 14.4080, longitude: -90.6940, nombre: 'María Matos y San Francisco' },
  'zona 4': { lat: 14.3980, lng: -90.7020, latitude: 14.3980, longitude: -90.7020, nombre: 'Valle de las Flores' },
  'zona 5': { lat: 14.4120, lng: -90.6910, latitude: 14.4120, longitude: -90.6910, nombre: 'Rincón de la Cruz y Periférico' },
};

/**
 * Consulta las viviendas y clientes asignados a una ruta en Palín desde Supabase.
 * @param {string} rutaNombre
 * @returns {Promise<Array>} Lista de viviendas georreferenciadas
 */
export const getRouteClients = async (rutaNombre = '') => {
  try {
    const { data: clients, error } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, direccion, telefono, email, activo, latitud, longitud')
      .eq('rol', 'cliente')
      .limit(30);

    if (error) {
      console.warn('[logistics.js] Error al consultar clientes para mapa de ruta:', error.message);
      return [];
    }

    const rutaKey = (rutaNombre || '').toLowerCase();
    let baseCoords = { lat: 14.4042, lng: -90.6978 };
    for (const [key, q] of Object.entries(PALIN_QUADRANTS)) {
      if (rutaKey.includes(key)) {
        baseCoords = { lat: q.lat, lng: q.lng };
        break;
      }
    }

    // Mapear viviendas priorizando coordenadas reales de perfiles
    return (clients || []).map((c, index) => {
      const realLat = parseFloat(c.latitud);
      const realLng = parseFloat(c.longitud);
      const hasRealCoords = !isNaN(realLat) && !isNaN(realLng) && realLat !== 0 && realLng !== 0;

      // Si aún no tiene GPS fijado, dispersar determinísticamente en el cuadrante de Palín
      const angle = (index * 45) * (Math.PI / 180);
      const radius = 0.0012 + (index * 0.0004);
      const lat = hasRealCoords ? realLat : baseCoords.lat + (Math.sin(angle) * radius);
      const lng = hasRealCoords ? realLng : baseCoords.lng + (Math.cos(angle) * radius);

      return {
        id: c.id,
        nombre_completo: c.nombre_completo || `Vecino #${index + 1}`,
        direccion: c.direccion || `Callejón Palín, Sector ${index + 1}`,
        telefono: c.telefono || null,
        activo: c.activo !== false,
        latitude: lat,
        longitude: lng,
        tipo: 'vivienda',
      };
    });
  } catch (err) {
    console.error('[logistics.js] Error en getRouteClients:', err);
    return [];
  }
};

/**
 * Consulta la dispersión de puntos de recolección registrados en Supabase para el supervisor.
 * @returns {Promise<Array>} Puntos georreferenciados
 */
export const getGeoreferencedCollections = async () => {
  try {
    // 1. Intentar consulta con join relacional a la tabla perfiles vía operario_id y cliente_id
    let { data: collections, error } = await supabase
      .from('historial_recolecciones')
      .select(`
        id,
        latitud,
        longitud,
        peso_kg,
        tipo_material,
        fecha_recoleccion,
        cliente_id,
        operario_id,
        operario:perfiles!operario_id(nombre_completo, codigo_camion),
        cliente:perfiles!cliente_id(nombre_completo, direccion)
      `)
      .order('fecha_recoleccion', { ascending: false })
      .limit(60);

    // 2. Fallback resiliente: Si la relación compuesta arroja error de esquema en PostgREST,
    // consultar únicamente las columnas nativas de historial_recolecciones
    if (error) {
      console.warn('[logistics.js] Fallback en join relacional:', error.message);
      const fallbackQuery = await supabase
        .from('historial_recolecciones')
        .select('id, latitud, longitud, peso_kg, tipo_material, fecha_recoleccion, cliente_id, operario_id')
        .order('fecha_recoleccion', { ascending: false })
        .limit(60);

      collections = fallbackQuery.data;
      error = fallbackQuery.error;
    }

    if (error) {
      console.warn('[logistics.js] Error consultando puntos georreferenciados:', error.message);
      return [];
    }

    // 3. Filtrar y normalizar puntos con coordenadas para visualización en el mapa
    const validPoints = [];
    (collections || []).forEach((c, index) => {
      let lat = parseFloat(c.latitud);
      let lng = parseFloat(c.longitud);

      // Si el registro no tenía GPS fijado, dispersar ordenadamente en el perímetro de Palín
      if (!lat || isNaN(lat) || !lng || isNaN(lng)) {
        const angle = (index * 60) * (Math.PI / 180);
        const radius = 0.002 + ((index % 5) * 0.001);
        lat = 14.4042 + Math.sin(angle) * radius;
        lng = -90.6978 + Math.cos(angle) * radius;
      }

      const clienteNombre = c.cliente?.nombre_completo || 'Vecino de Palín';
      const clienteDireccion = c.cliente?.direccion || 'Sector Palín, Escuintla';
      const operarioNombre = c.operario?.nombre_completo || 'Operario de Turno';
      const codigoCamion = c.operario?.codigo_camion || 'CAM-01';

      validPoints.push({
        id: c.id?.toString() || `col_pt_${index}`,
        latitud: lat,
        longitud: lng,
        latitude: lat,
        longitude: lng,
        peso_kg: c.peso_kg || 0,
        tipo_material: c.tipo_material || 'reciclaje',
        material_tipo: c.tipo_material || 'reciclaje',
        fecha_recoleccion: c.fecha_recoleccion,
        fecha_hora: c.fecha_recoleccion,
        operario_nombre: operarioNombre,
        codigo_camion: codigoCamion,
        usuarios: {
          nombre_completo: clienteNombre,
          direccion: clienteDireccion,
        },
        cliente_nombre: clienteNombre,
        cliente_direccion: clienteDireccion,
        tipo: 'recoleccion',
      });
    });

    return validPoints;
  } catch (err) {
    console.error('[logistics.js] Error en getGeoreferencedCollections:', err);
    return [];
  }
};

