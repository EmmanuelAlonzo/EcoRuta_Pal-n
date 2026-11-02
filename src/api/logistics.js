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
      .select('id, nombre_completo, direccion, telefono, email, activo')
      .eq('rol', 'cliente')
      .limit(20);

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

    // Mapear viviendas con microdispersión geográfica para visualización clara en mapa
    return (clients || []).map((c, index) => {
      // Offset radial determinista para cada vivienda en el cuadrante de Palín
      const angle = (index * 45) * (Math.PI / 180);
      const radius = 0.0012 + (index * 0.0004);
      const lat = baseCoords.lat + (Math.sin(angle) * radius);
      const lng = baseCoords.lng + (Math.cos(angle) * radius);

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

