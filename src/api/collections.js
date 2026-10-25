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
    puntos_otorgados: parseInt(record.puntos_otorgados, 10) || 0,
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
