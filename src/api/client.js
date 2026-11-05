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
    .gt('stock', 0);

  if (error) {
    console.error('[client.js] Error al consultar catálogo de incentivos:', error);
    throw error;
  }

  // Ordenar de menor a mayor costo de puntos de forma segura
  const sorted = (data || []).sort(
    (a, b) =>
      (a.puntos_requeridos ?? a.costo_puntos ?? 0) -
      (b.puntos_requeridos ?? b.costo_puntos ?? 0)
  );

  // Solo las ofertas aprobadas se muestran a los clientes
  const filtered = sorted.filter((item) => {
    if (item.estado_aprobacion) {
      return item.estado_aprobacion === 'aprobado';
    }
    return true;
  });

  return filtered;
};

/**
 * Consulta los comercios afiliados y agrupa sus ofertas aprobadas y con stock
 * desde la tabla `catalogo_incentivos`.
 * 
 * @returns {Promise<Array>} Lista de comercios afiliados con sus ofertas
 */
export const getMerchantsWithOffers = async () => {
  try {
    // 1. Consultar ofertas activas y con existencias
    const { data: offersData, error: offersErr } = await supabase
      .from('catalogo_incentivos')
      .select('*')
      .eq('activo', true)
      .gt('stock', 0);

    if (offersErr) {
      console.warn('[client.js] Advertencia consultando ofertas en catalogo_incentivos:', offersErr.message);
    }

    const approvedOffers = (offersData || []).filter(
      (o) => !o.estado_aprobacion || o.estado_aprobacion === 'aprobado'
    );

    // 2. Consultar comercios aliados
    const { data: merchantsData, error: merchErr } = await supabase
      .from('comercios')
      .select('*')
      .eq('activo', true)
      .order('nombre', { ascending: true });

    if (merchErr) {
      console.warn('[client.js] Advertencia consultando tabla comercios:', merchErr.message);
    }

    const merchantsMap = new Map();

    // Registrar comercios formales de la tabla comercios
    (merchantsData || []).forEach((m) => {
      merchantsMap.set(String(m.id || m.nombre).toLowerCase(), {
        id: m.id,
        nombre: m.nombre,
        categoria: m.categoria || 'Comercio Local',
        direccion: m.direccion || 'Palín, Escuintla',
        horario: m.horario || 'Lunes a Sábado',
        telefono: m.telefono || '',
        icono: m.icono || (
          (m.categoria || '').toLowerCase().includes('café') ? '☕' :
          (m.categoria || '').toLowerCase().includes('farmacia') || (m.categoria || '').toLowerCase().includes('salud') ? '💊' :
          (m.categoria || '').toLowerCase().includes('abarrotes') ? '🛒' :
          (m.categoria || '').toLowerCase().includes('ferretería') ? '🔨' : '🏪'
        ),
        ofertas: [],
      });
    });

    // Asignar ofertas a sus comercios correspondientes
    approvedOffers.forEach((o) => {
      const comercioName = (o.comercio || 'Comercio Aliado').trim();
      let target = null;

      if (o.comercio_id && merchantsMap.has(String(o.comercio_id).toLowerCase())) {
        target = merchantsMap.get(String(o.comercio_id).toLowerCase());
      } else {
        // Buscar por nombre de comercio
        for (const [, m] of merchantsMap) {
          if (m.nombre.toLowerCase() === comercioName.toLowerCase()) {
            target = m;
            break;
          }
        }
      }

      // Si la oferta no tiene registro en tabla comercios, crear comercio dinámico
      if (!target) {
        const dynamicKey = comercioName.toLowerCase();
        if (!merchantsMap.has(dynamicKey)) {
          merchantsMap.set(dynamicKey, {
            id: `comercio-${o.id}`,
            nombre: comercioName,
            categoria: o.categoria || 'Comercio Local',
            direccion: o.direccion || 'Palín, Escuintla',
            horario: o.horario || 'Horario Comercial',
            telefono: o.telefono || '',
            icono: (o.categoria || '').toLowerCase().includes('café') ? '☕' :
              (o.categoria || '').toLowerCase().includes('farmacia') || (o.categoria || '').toLowerCase().includes('salud') ? '💊' :
              (o.categoria || '').toLowerCase().includes('abarrotes') ? '🛒' :
              (o.categoria || '').toLowerCase().includes('ferretería') ? '🔨' : '🏪',
            ofertas: [],
          });
        }
        target = merchantsMap.get(dynamicKey);
      }

      target.ofertas.push({
        id: o.id,
        nombre: o.nombre,
        descripcion: o.descripcion,
        puntos_requeridos: o.puntos_requeridos ?? o.costo_puntos ?? 50,
        costo_puntos: o.puntos_requeridos ?? o.costo_puntos ?? 50,
        stock: o.stock ?? o.limite_canjes ?? 10,
        limite_canjes: o.limite_canjes ?? o.stock,
        tipo_promocion: o.tipo_promocion || 'Descuento (Q)',
        fecha_fin: o.fecha_fin || null,
        comercio: target.nombre,
      });
    });

    return Array.from(merchantsMap.values());
  } catch (err) {
    console.error('[client.js] Error en getMerchantsWithOffers:', err);
    return [];
  }
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

    const currentPoints = profile.puntos_acumulados ?? 0;
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

    // PASO B: Actualizar `perfiles` deduciendo los puntos estrictamente en `puntos_acumulados`
    const nuevoSaldo = Math.max(0, currentPoints - costPuntos);
    const profileUpdatePayload = {
      puntos_acumulados: nuevoSaldo,
      updated_at: new Date().toISOString(),
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

/**
 * Actualiza los datos de contacto, dirección y coordenadas GPS (latitud y longitud)
 * de la vivienda del cliente en la tabla `perfiles` de Supabase.
 * 
 * @param {string} userId - UUID del cliente
 * @param {object} param1 - Datos actualizables
 * @param {string} [param1.nombre_completo]
 * @param {string} [param1.telefono]
 * @param {string} [param1.direccion]
 * @param {number|string} [param1.latitud]
 * @param {number|string} [param1.longitud]
 * @returns {Promise<object>} Perfil actualizado en Supabase
 */
export const updateClientProfile = async (userId, {
  nombre_completo,
  telefono,
  direccion,
  latitud,
  longitud,
}) => {
  if (!userId) {
    throw new Error('El ID de usuario es requerido para actualizar el perfil.');
  }

  const payload = {
    updated_at: new Date().toISOString(),
  };

  if (nombre_completo !== undefined) payload.nombre_completo = nombre_completo.trim();
  if (telefono !== undefined) payload.telefono = telefono ? telefono.trim() : null;
  if (direccion !== undefined) payload.direccion = direccion ? direccion.trim() : null;

  if (latitud !== undefined && latitud !== null && latitud !== '') {
    const latNum = parseFloat(latitud);
    if (!isNaN(latNum)) payload.latitud = latNum;
  }
  if (longitud !== undefined && longitud !== null && longitud !== '') {
    const lngNum = parseFloat(longitud);
    if (!isNaN(lngNum)) payload.longitud = lngNum;
  }

  try {
    const { data, error } = await supabase
      .from('perfiles')
      .update(payload)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.warn('[client.js] Error en update inicial de perfiles:', error.message);

      // Si las columnas latitud/longitud no existen aún en el esquema de la base de datos,
      // intentar guardar los datos básicos para no bloquear la actualización de contacto
      if (error.message && (error.message.includes('latitud') || error.message.includes('longitud'))) {
        const fallbackPayload = {
          updated_at: new Date().toISOString(),
        };
        if (nombre_completo !== undefined) fallbackPayload.nombre_completo = nombre_completo.trim();
        if (telefono !== undefined) fallbackPayload.telefono = telefono ? telefono.trim() : null;
        if (direccion !== undefined) fallbackPayload.direccion = direccion ? direccion.trim() : null;

        const { data: fbData, error: fbErr } = await supabase
          .from('perfiles')
          .update(fallbackPayload)
          .eq('id', userId)
          .select()
          .single();

        if (fbErr) throw fbErr;
        return { ...(fbData || fallbackPayload), ...payload };
      }

      throw error;
    }

    return data;
  } catch (err) {
    console.error('[client.js] Error actualizando perfil en Supabase:', err);
    throw err;
  }
};

/**
 * Consulta la lista de clientes registrados en la tabla `perfiles` con sus coordenadas de vivienda.
 * Utilizado por el panel de supervisión para renderizar marcadores de viviendas en el mapa.
 * 
 * @returns {Promise<Array>} Lista de perfiles de clientes georreferenciados
 */
export const getGeoreferencedClients = async () => {
  try {
    let { data, error } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, email, telefono, direccion, latitud, longitud, activo, puntos_acumulados, puntos_reciclaje')
      .eq('rol', 'cliente')
      .order('nombre_completo', { ascending: true });

    if (error) {
      console.warn('[client.js] Error al consultar perfiles con coordenadas, intentando select general:', error.message);
      const fb = await supabase
        .from('perfiles')
        .select('*')
        .eq('rol', 'cliente');
      data = fb.data;
      error = fb.error;
    }

    if (error) {
      console.error('[client.js] Error crítico consultando clientes georreferenciados:', error);
      return [];
    }

    // Normalizar clientes para marcadores de mapa
    return (data || []).map((c, index) => {
      let lat = parseFloat(c.latitud ?? c.latitude);
      let lng = parseFloat(c.longitud ?? c.longitude);
      const hasExactCoords = !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;

      // Si el cliente aún no ha fijado coordenadas exactas, dispersar con patrón predecible en Palín
      if (!hasExactCoords) {
        const angle = (index * 45) * (Math.PI / 180);
        const radius = 0.0015 + ((index % 6) * 0.0006);
        lat = 14.4042 + Math.sin(angle) * radius;
        lng = -90.6978 + Math.cos(angle) * radius;
      }

      return {
        id: c.id,
        nombre_completo: c.nombre_completo || `Vecino #${index + 1}`,
        email: c.email || '',
        telefono: c.telefono || 'Sin teléfono',
        direccion: c.direccion || 'Palín, Escuintla',
        latitud: lat,
        longitud: lng,
        latitude: lat,
        longitude: lng,
        hasExactCoords,
        puntos: c.puntos_acumulados ?? 0,
        puntos_acumulados: c.puntos_acumulados ?? 0,
        puntos_reciclaje: c.puntos_reciclaje ?? 0,
        activo: c.activo !== false,
        tipo: 'vivienda',
        title: `🏠 ${c.nombre_completo || 'Vivienda Vecino'}`,
        description: `${c.direccion || 'Palín'} • ${hasExactCoords ? '📍 GPS Confirmado' : '⏳ Ubicación estimada'}`,
      };
    });
  } catch (err) {
    console.error('[client.js] Excepción en getGeoreferencedClients:', err);
    return [];
  }
};

// Re-exportar funciones del módulo financiero
export {
  createSubscriptionPayment,
  getSubscriptionPayments,
  getAffiliatedMerchants,
} from './financial';

