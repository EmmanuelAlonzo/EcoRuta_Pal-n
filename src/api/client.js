import { supabase } from '../services/supabase';

/**
 * Servicio API para el Portal del Ciudadano / Cliente (EcoRuta Palín)
 * Conexión directa y exclusiva a Supabase Database.
 */

/**
 * Consulta el perfil actualizado del cliente (incluyendo saldo de puntos).
 * @param {string} userId - UUID del usuario en Supabase
 * @returns {Promise<object>} Perfil del cliente
 */
export const getClientProfile = async (userId) => {
  if (!userId) {
    throw new Error('El ID de usuario es obligatorio para consultar el perfil.');
  }

  const { data, error } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[client.js] Error al consultar perfil del cliente:', error);
    throw error;
  }

  return data;
};

/**
 * Consulta el historial de recolecciones de un ciudadano.
 * @param {string} userId - UUID del cliente en Supabase
 * @returns {Promise<Array>} Lista de recolecciones ordenadas por fecha
 */
export const getClientCollections = async (userId) => {
  if (!userId) {
    throw new Error('El ID de usuario es obligatorio para consultar el historial de recolecciones.');
  }

  const { data, error } = await supabase
    .from('historial_recolecciones')
    .select('*')
    .eq('cliente_id', userId)
    .order('fecha_recoleccion', { ascending: false });

  if (error) {
    console.error('[client.js] Error al consultar historial de recolecciones:', error);
    throw error;
  }

  return data || [];
};

/**
 * Consulta el catálogo de incentivos activos y con existencias disponibles.
 * @returns {Promise<Array>} Lista de incentivos
 */
export const getAvailableIncentives = async () => {
  const { data, error } = await supabase
    .from('catalogo_incentivos')
    .select('*')
    .eq('activo', true)
    .gt('stock', 0)
    .order('costo_puntos', { ascending: true });

  if (error) {
    console.error('[client.js] Error al consultar catálogo de incentivos:', error);
    throw error;
  }

  return data || [];
};

/**
 * Consulta el historial de canjes realizados por el cliente.
 * @param {string} userId - UUID del cliente en Supabase
 * @returns {Promise<Array>} Lista de canjes
 */
export const getClientRedemptions = async (userId) => {
  if (!userId) {
    throw new Error('El ID de usuario es obligatorio para consultar los canjes.');
  }

  const { data, error } = await supabase
    .from('historial_canjes')
    .select('*, catalogo_incentivos(*)')
    .eq('cliente_id', userId)
    .order('fecha_canje', { ascending: false });

  if (error) {
    console.error('[client.js] Error al consultar historial de canjes:', error);
    throw error;
  }

  return data || [];
};

/**
 * Ejecuta la transacción de canje de un incentivo en Supabase:
 *  A. Verifica saldo del cliente en `perfiles`
 *  B. Verifica stock en `catalogo_incentivos`
 *  C. Inserta registro en `historial_canjes` (estado: 'pendiente')
 *  D. Descuenta los puntos del usuario en la tabla `perfiles`
 *  E. Descuenta 1 unidad del stock en la tabla `catalogo_incentivos`
 * 
 * @param {string} userId - UUID del cliente
 * @param {string|number} incentiveId - ID del incentivo a canjear
 * @param {number} costPuntos - Cantidad de puntos a debitar
 * @returns {Promise<{ success: boolean, canje: object, nuevoSaldo: number, nuevoStock: number }>}
 */
export const redeemIncentive = async (userId, incentiveId, costPuntos) => {
  if (!userId || !incentiveId) {
    throw new Error('Parámetros inválidos para realizar el canje.');
  }

  try {
    // 1. Verificar saldo actual en la tabla `perfiles`
    const { data: profile, error: profileErr } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileErr) {
      console.error('[client.js] Error verificando perfil para canje:', profileErr);
      throw new Error('No se pudo verificar el saldo actual de tu perfil en Supabase.');
    }

    const currentPoints = profile.puntos_reciclaje ?? profile.puntos_acumulados ?? 0;
    if (currentPoints < costPuntos) {
      throw new Error(
        `Saldo insuficiente. Tienes ${currentPoints} puntos y se requieren ${costPuntos} puntos.`
      );
    }

    // 2. Verificar existencia de stock en `catalogo_incentivos`
    const { data: incentive, error: incentiveErr } = await supabase
      .from('catalogo_incentivos')
      .select('*')
      .eq('id', incentiveId)
      .single();

    if (incentiveErr) {
      console.error('[client.js] Error verificando stock de incentivo:', incentiveErr);
      throw new Error('No se pudo comprobar la disponibilidad del incentivo.');
    }

    if (!incentive || incentive.stock <= 0) {
      throw new Error('Lo sentimos, este incentivo ya no cuenta con stock disponible.');
    }

    // PASO A: Insertar el nuevo canje en `historial_canjes`
    const canjePayload = {
      cliente_id: userId,
      incentivo_id: incentiveId,
      puntos_descontados: parseInt(costPuntos, 10),
      estado: 'pendiente',
      fecha_canje: new Date().toISOString(),
    };

    const { data: canjeData, error: canjeErr } = await supabase
      .from('historial_canjes')
      .insert([canjePayload])
      .select()
      .single();

    if (canjeErr) {
      console.error('[client.js] Error insertando en historial_canjes:', canjeErr);
      throw new Error(`Fallo al registrar el canje: ${canjeErr.message}`);
    }

    // PASO B: Actualizar `perfiles` deduciendo los puntos
    const nuevoSaldo = Math.max(0, currentPoints - costPuntos);
    const profileUpdatePayload = {
      puntos_reciclaje: nuevoSaldo,
      ...(profile.puntos_acumulados !== undefined ? { puntos_acumulados: nuevoSaldo } : {}),
    };

    const { error: updateProfileErr } = await supabase
      .from('perfiles')
      .update(profileUpdatePayload)
      .eq('id', userId);

    if (updateProfileErr) {
      console.error('[client.js] Error actualizando puntos en perfiles:', updateProfileErr);
      throw new Error(
        `El canje fue creado pero ocurrió un problema deduciendo tus puntos: ${updateProfileErr.message}`
      );
    }

    // PASO C: Actualizar `catalogo_incentivos` restando 1 unidad de stock
    const nuevoStock = Math.max(0, incentive.stock - 1);
    const { error: updateStockErr } = await supabase
      .from('catalogo_incentivos')
      .update({ stock: nuevoStock })
      .eq('id', incentiveId);

    if (updateStockErr) {
      console.warn('[client.js] Advertencia actualizando stock de incentivo:', updateStockErr.message);
    }

    return {
      success: true,
      canje: canjeData,
      nuevoSaldo,
      nuevoStock,
    };
  } catch (error) {
    console.error('[client.js] Error en transacción redeemIncentive:', error);
    throw error;
  }
};
