import { supabase } from '../services/supabase';

/**
 * Servicio API para el Módulo ERP: Logística, Flota y Gestión de Personal (EcoRuta Palín)
 */

// ─── GESTIÓN DE PERSONAL (ADMINISTRADOR) ────────────────────────────────────

/**
 * Consulta la lista de colaboradores municipales (operarios, pilotos y supervisores)
 * @returns {Promise<Array>}
 */
export const getPersonnelList = async () => {
  const { data, error } = await supabase
    .from('perfiles')
    .select('*')
    .in('rol', ['operario', 'piloto', 'supervisor'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[logistics.js] Error al consultar personal:', error);
    throw error;
  }

  return data || [];
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
 * Registra un nuevo camión en la flota municipal
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
 * Registra una nueva ruta de recolección
 * @param {object} ruta
 * @returns {Promise<object>}
 */
export const createRoute = async ({ nombre, descripcion }) => {
  const payload = {
    nombre: nombre.trim(),
    descripcion: descripcion ? descripcion.trim() : 'Ruta urbana de recolección',
  };

  const { data, error } = await supabase
    .from('rutas')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error('[logistics.js] Error creando ruta:', error);
    throw error;
  }

  return data;
};

/**
 * Actualiza los datos de una ruta existente
 * @param {string|number} id
 * @param {object} updates
 * @returns {Promise<object>}
 */
export const updateRoute = async (id, { nombre, descripcion }) => {
  const payload = {};
  if (nombre !== undefined) payload.nombre = nombre.trim();
  if (descripcion !== undefined) payload.descripcion = descripcion.trim();

  const { data, error } = await supabase
    .from('rutas')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[logistics.js] Error actualizando ruta:', error);
    throw error;
  }

  return data;
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
