import { supabase } from '../services/supabase';
import { obtenerUltimaRecoleccionLocal } from '../services/sqlite/database';

/**
 * Servicio API para Gestión de Recolecciones (EcoRuta Palín)
 * Manejo de inserción en Supabase y control anti-fraude por frecuencia (Cooldown).
 */

/**
 * Consulta la recolección más reciente de un cliente en Supabase (y SQLite local)
 * para validar si se encuentra dentro del periodo de Cooldown de 18 horas.
 * 
 * @param {string} clienteId - UUID del ciudadano
 * @param {number} [cooldownHours=18] - Horas mínimas requeridas entre recolecciones
 * @returns {Promise<{ isBlocked: boolean, lastDate: string | null, hoursElapsed: number | null }>}
 */
export const checkRecentCollection = async (clienteId, cooldownHours = 18) => {
  if (!clienteId) {
    return { isBlocked: false, lastDate: null, hoursElapsed: null };
  }

  const now = new Date();

  // 1. Consulta rápida read-before-write a Supabase
  try {
    const { data, error } = await supabase
      .from('historial_recolecciones')
      .select('fecha_recoleccion')
      .eq('cliente_id', clienteId)
      .order('fecha_recoleccion', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data?.fecha_recoleccion) {
      const lastRemoteDate = new Date(data.fecha_recoleccion);
      const hoursDiff = (now.getTime() - lastRemoteDate.getTime()) / (1000 * 60 * 60);

      if (hoursDiff >= 0 && hoursDiff < cooldownHours) {
        return {
          isBlocked: true,
          lastDate: data.fecha_recoleccion,
          hoursElapsed: parseFloat(hoursDiff.toFixed(1)),
        };
      }
    }
  } catch (remoteErr) {
    console.warn('[collections.js] Advertencia al consultar historial remoto en Supabase:', remoteErr.message);
  }

  // 2. Consulta en base de datos local SQLite (para capturar recolecciones recientes aún no sincronizadas)
  try {
    const localRecord = await obtenerUltimaRecoleccionLocal(clienteId);
    if (localRecord?.fecha_recoleccion) {
      const lastLocalDate = new Date(localRecord.fecha_recoleccion);
      const hoursDiff = (now.getTime() - lastLocalDate.getTime()) / (1000 * 60 * 60);

      if (hoursDiff >= 0 && hoursDiff < cooldownHours) {
        return {
          isBlocked: true,
          lastDate: localRecord.fecha_recoleccion,
          hoursElapsed: parseFloat(hoursDiff.toFixed(1)),
        };
      }
    }
  } catch (localErr) {
    console.warn('[collections.js] Advertencia al consultar historial local en SQLite:', localErr.message);
  }

  return { isBlocked: false, lastDate: null, hoursElapsed: null };
};

/**
 * Inserta un registro de recolección en la tabla remota `historial_recolecciones` de Supabase.
 * 
 * @param {object} record - Registro local proveniente de SQLite
 * @returns {Promise<object>} Registro insertado en Supabase
 */
export const uploadCollectionRecord = async (record) => {
  const payload = {
    cliente_id: record.cliente_id,
    operario_id: record.operario_id,
    tipo_material: record.tipo_material,
    peso_kg: parseFloat(record.peso_kg) || 0,
    latitud: record.latitud !== null ? parseFloat(record.latitud) : null,
    longitud: record.longitud !== null ? parseFloat(record.longitud) : null,
    fecha_recoleccion: record.fecha_recoleccion,
  };

  const { data, error } = await supabase
    .from('historial_recolecciones')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error('[collections.js] Error al insertar en Supabase:', error);
    throw new Error(error.message || 'Error al subir la recolección a Supabase.');
  }

  return data;
};

/**
 * Consulta la información del titular en la tabla `perfiles` para la validación visual antifraude.
 * Permite buscar por `codigo_vecino` (ej. "P-A1B2C3") o por UUID `id`.
 * 
 * @param {string} clienteId - UUID o código de vecino del ciudadano escaneado
 * @returns {Promise<{ found: boolean, profile: object | null, error?: string }>}
 */
export const getCitizenVerification = async (clienteId) => {
  if (!clienteId) {
    return { found: false, profile: null };
  }

  const cleanCode = clienteId.trim();

  try {
    let data = null;

    // 1. Intentar buscar primero por codigo_vecino
    const { data: codeData, error: codeErr } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, direccion, activo, rol, email, telefono, puntos_reciclaje, puntos_acumulados, codigo_vecino')
      .ilike('codigo_vecino', cleanCode)
      .maybeSingle();

    if (codeData) {
      data = codeData;
    } else {
      // 2. Si no se encuentra, buscar por id UUID
      const { data: idData, error: idErr } = await supabase
        .from('perfiles')
        .select('id, nombre_completo, direccion, activo, rol, email, telefono, puntos_reciclaje, puntos_acumulados, codigo_vecino')
        .eq('id', cleanCode)
        .maybeSingle();

      if (idErr && codeErr) {
        console.warn('[collections.js] Error al consultar perfil para verificación:', idErr.message);
        return { found: false, profile: null, error: idErr.message };
      }
      data = idData;
    }

    if (!data) {
      return { found: false, profile: null };
    }

    return {
      found: true,
      profile: {
        id: data.id,
        codigo_vecino: data.codigo_vecino || null,
        nombre_completo: data.nombre_completo || 'Titular sin nombre registrado',
        direccion: data.direccion || 'Dirección no especificada en el sistema',
        activo: data.activo !== false,
        estado_suscripcion: data.activo !== false ? 'Activo' : 'Suspendido',
        puntos_acumulados: data.puntos_acumulados ?? 0,
        puntos_reciclaje: data.puntos_reciclaje ?? 0,
        email: data.email || null,
        telefono: data.telefono || null,
      },
    };
  } catch (err) {
    console.error('[collections.js] Excepción al verificar ciudadano:', err);
    return { found: false, profile: null, error: err.message };
  }
};

/**
 * Registra un log de alerta por posible fraude en Supabase asociando el código QR,
 * las coordenadas GPS actuales del operario y el motivo de rechazo.
 * 
 * @param {object} fraudData
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
export const reportFraudLog = async ({
  qr_code,
  cliente_id,
  operario_id,
  operario_nombre,
  codigo_camion,
  ruta_asignada,
  latitud,
  longitud,
  precision_gps,
  motivo = 'Dirección incorrecta / Rechazado en validación visual',
  direccion_declarada,
  titular_declarado,
}) => {
  const payload = {
    qr_code: qr_code || cliente_id,
    cliente_id: cliente_id || null,
    operario_id: operario_id || null,
    operario_nombre: operario_nombre || 'Operario de Ruta',
    codigo_camion: codigo_camion || 'Sin camión',
    ruta_asignada: ruta_asignada || 'Sin ruta',
    latitud: latitud !== null ? parseFloat(latitud) : null,
    longitud: longitud !== null ? parseFloat(longitud) : null,
    precision_gps: precision_gps !== null ? parseFloat(precision_gps) : null,
    motivo,
    direccion_declarada: direccion_declarada || null,
    titular_declarado: titular_declarado || null,
    fecha_reporte: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('reportes_fraude')
      .insert([payload])
      .select()
      .maybeSingle();

    if (error) {
      console.warn('[collections.js] Advertencia al insertar en reportes_fraude:', error.message);
      return { success: true, message: error.message };
    }

    return { success: true, data };
  } catch (err) {
    console.warn('[collections.js] Excepción en reportFraudLog:', err.message);
    return { success: false, error: err.message };
  }
};

