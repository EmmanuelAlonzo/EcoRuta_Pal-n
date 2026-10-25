import { supabase } from '../services/supabase';

/**
 * Servicio API para el Módulo de Administración Municipal (EcoRuta Palín)
 * Conexión directa y exclusiva a Supabase Database (100% real, sin datos simulados).
 */

/**
 * Consulta métricas globales de impacto ambiental y participación ciudadana.
 * Suma el total de kilogramos reciclados y puntos otorgados históricamente.
 * 
 * @returns {Promise<{ totalKg: number, totalPuntos: number, totalRecolecciones: number, pendingCanjes: number, totalClientes: number, materialStats: object }>}
 */
export const getGlobalMetrics = async () => {
  try {
    // 1. Consultar historial de recolecciones para sumar peso y puntos reales
    const { data: collections, error: colErr } = await supabase
      .from('historial_recolecciones')
      .select('peso_kg, puntos_otorgados, tipo_material');

    if (colErr) {
      console.error('[admin.js] Error al consultar historial_recolecciones:', colErr);
      throw colErr;
    }

    let totalKg = 0;
    let totalPuntos = 0;
    const materialStats = {
      plastico: 0,
      carton: 0,
      aluminio: 0,
      vidrio: 0,
      mixto: 0,
    };

    (collections || []).forEach((c) => {
      const kg = parseFloat(c.peso_kg) || 0;
      const pts = parseInt(c.puntos_otorgados, 10) || 0;
      totalKg += kg;
      totalPuntos += pts;

      const mat = (c.tipo_material || '').toLowerCase();
      if (mat.includes('plast')) materialStats.plastico += kg;
      else if (mat.includes('cart') || mat.includes('papel')) materialStats.carton += kg;
      else if (mat.includes('alum') || mat.includes('metal')) materialStats.aluminio += kg;
      else if (mat.includes('vidr')) materialStats.vidrio += kg;
      else materialStats.mixto += kg;
    });

    // 2. Consultar conteo de canjes en estado 'pendiente'
    let pendingCanjes = 0;
    const { count: canjesCount, error: canjesErr } = await supabase
      .from('historial_canjes')
      .select('*', { count: 'exact', head: true })
      .eq('estado', 'pendiente');

    if (canjesErr) {
      console.warn('[admin.js] Error al contar canjes pendientes:', canjesErr.message);
    } else if (canjesCount !== null) {
      pendingCanjes = canjesCount;
    }

    // 3. Consultar total de ciudadanos registrados
    let totalClientes = 0;
    const { count: perfilesCount, error: perfilesErr } = await supabase
      .from('perfiles')
      .select('*', { count: 'exact', head: true })
      .eq('rol', 'cliente');

    if (perfilesErr) {
      console.warn('[admin.js] Error al contar ciudadanos:', perfilesErr.message);
    } else if (perfilesCount !== null) {
      totalClientes = perfilesCount;
    }

    return {
      totalKg: parseFloat(totalKg.toFixed(1)),
      totalPuntos,
      totalRecolecciones: (collections || []).length,
      pendingCanjes,
      totalClientes,
      materialStats,
    };
  } catch (error) {
    console.error('[admin.js] Error consultando métricas reales en Supabase:', error);
    // Devuelve ceros si ocurre un error o la base de datos está vacía, sin datos falsos
    return {
      totalKg: 0,
      totalPuntos: 0,
      totalRecolecciones: 0,
      pendingCanjes: 0,
      totalClientes: 0,
      materialStats: { plastico: 0, carton: 0, aluminio: 0, vidrio: 0, mixto: 0 },
    };
  }
};

/**
 * Consulta los canjes pendientes de entrega, enriqueciendo los registros con
 * el nombre del ciudadano (`perfiles`) y el nombre del premio (`catalogo_incentivos`).
 * 
 * @returns {Promise<Array>} Lista real de canjes pendientes
 */
export const getPendingRedemptions = async () => {
  const { data: canjes, error: canjesErr } = await supabase
    .from('historial_canjes')
    .select('*')
    .eq('estado', 'pendiente')
    .order('fecha_canje', { ascending: false });

  if (canjesErr) {
    console.error('[admin.js] Error al consultar historial_canjes en Supabase:', canjesErr);
    throw canjesErr;
  }

  if (!canjes || canjes.length === 0) {
    return [];
  }

  // Enriquecer cada canje con nombre de cliente e incentivo desde Supabase
  const enriched = await Promise.all(
    canjes.map(async (c) => {
      let clienteNombre = 'Vecino de Palín';
      let clienteEmail = '';
      let incentivoNombre = 'Recompensa Ecológica';
      let incentivoComercio = 'Comercio Aliado';

      // Consulta de perfil del cliente
      if (c.cliente_id) {
        try {
          const { data: p } = await supabase
            .from('perfiles')
            .select('nombre_completo, email')
            .eq('id', c.cliente_id)
            .single();

          if (p?.nombre_completo) clienteNombre = p.nombre_completo;
          if (p?.email) clienteEmail = p.email;
        } catch {
          // Continúa con valor por defecto
        }
      }

      // Consulta de datos del incentivo
      if (c.incentivo_id) {
        try {
          const { data: inc } = await supabase
            .from('catalogo_incentivos')
            .select('nombre, comercio')
            .eq('id', c.incentivo_id)
            .single();

          if (inc?.nombre) incentivoNombre = inc.nombre;
          if (inc?.comercio) incentivoComercio = inc.comercio;
        } catch {
          // Continúa con valor por defecto
        }
      }

      return {
        ...c,
        cliente_nombre: clienteNombre,
        cliente_email: clienteEmail,
        incentivo_nombre: incentivoNombre,
        incentivo_comercio: incentivoComercio,
      };
    })
  );

  return enriched;
};

/**
 * Actualiza el registro en `historial_canjes` cambiando su estado a 'entregado'.
 * 
 * @param {string} canjeId - ID real del canje en Supabase
 * @returns {Promise<object>} Registro actualizado
 */
export const approveRedemption = async (canjeId) => {
  if (!canjeId) {
    throw new Error('El ID de canje es requerido.');
  }

  const { data, error } = await supabase
    .from('historial_canjes')
    .update({
      estado: 'entregado',
    })
    .eq('id', canjeId)
    .select()
    .single();

  if (error) {
    console.error('[admin.js] Error al aprobar canje en Supabase:', error);
    throw new Error(error.message || 'Error al actualizar el estado del canje.');
  }

  return data;
};

/**
 * Rechaza un canje pendiente en Supabase:
 * 1. Actualiza el estado a 'rechazado' en `historial_canjes`.
 * 2. Reembolsa los puntos al ciudadano en la tabla `perfiles`.
 * 3. Restaura +1 unidad de stock en la tabla `catalogo_incentivos`.
 * 
 * @param {string} canjeId - ID real del canje en Supabase
 * @returns {Promise<object>} Registro actualizado
 */
export const rejectRedemption = async (canjeId) => {
  if (!canjeId) {
    throw new Error('El ID de canje es requerido.');
  }

  // 1. Obtener datos del canje para conocer cliente, puntos e incentivo
  const { data: canje, error: canjeErr } = await supabase
    .from('historial_canjes')
    .select('*')
    .eq('id', canjeId)
    .single();

  if (canjeErr || !canje) {
    console.error('[admin.js] Error al buscar canje para rechazo:', canjeErr);
    throw new Error('No se encontró el canje que se desea rechazar.');
  }

  // 2. Marcar canje como rechazado
  const { data: updatedCanje, error: updateErr } = await supabase
    .from('historial_canjes')
    .update({
      estado: 'rechazado',
    })
    .eq('id', canjeId)
    .select()
    .single();

  if (updateErr) {
    console.error('[admin.js] Error actualizando estado a rechazado:', updateErr);
    throw new Error(updateErr.message || 'Error al rechazar el canje en Supabase.');
  }

  // 3. Reembolsar los puntos al perfil del cliente
  const puntosAReembolsar = parseInt(canje.puntos_descontados, 10) || 0;
  if (canje.cliente_id && puntosAReembolsar > 0) {
    try {
      const { data: profile } = await supabase
        .from('perfiles')
        .select('*')
        .eq('id', canje.cliente_id)
        .single();

      if (profile) {
        const saldoActual = profile.puntos_reciclaje ?? profile.puntos_acumulados ?? 0;
        const nuevoSaldo = saldoActual + puntosAReembolsar;

        await supabase
          .from('perfiles')
          .update({
            puntos_reciclaje: nuevoSaldo,
            ...(profile.puntos_acumulados !== undefined ? { puntos_acumulados: nuevoSaldo } : {}),
          })
          .eq('id', canje.cliente_id);
      }
    } catch (refundErr) {
      console.warn('[admin.js] Advertencia al reembolsar puntos al usuario:', refundErr.message);
    }
  }

  // 4. Restaurar +1 al stock del incentivo
  if (canje.incentivo_id) {
    try {
      const { data: inc } = await supabase
        .from('catalogo_incentivos')
        .select('stock')
        .eq('id', canje.incentivo_id)
        .single();

      if (inc && inc.stock !== null) {
        await supabase
          .from('catalogo_incentivos')
          .update({ stock: inc.stock + 1 })
          .eq('id', canje.incentivo_id);
      }
    } catch (stockErr) {
      console.warn('[admin.js] Advertencia al restaurar stock del incentivo:', stockErr.message);
    }
  }

  return updatedCanje;
};
