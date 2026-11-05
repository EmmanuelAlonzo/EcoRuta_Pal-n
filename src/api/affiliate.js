import { supabase } from '../services/supabase';

/**
 * Servicio API para Comercios Afiliados (EcoRuta Palín) - Modelo CPA
 * Maneja el canje de eco-puntos por descuentos en compras reales,
 * deducción de saldo del cliente y cálculo del saldo a pagar a EcoRuta
 * por concepto de comisión por cliente referido (Q1.50 por canje).
 */

/**
 * Valida a un ciudadano para canje en el comercio afiliado mediante su `codigo_vecino` corto (ej. "P-A1B2C3").
 * Incluye fallback por UUID `id` en caso de códigos heredados.
 * 
 * @param {string|object} params - Código de vecino o identificador escaneado
 * @returns {Promise<{ found: boolean, profile: object | null, error?: string }>}
 */
export const validateRedemption = async (params) => {
  const code = typeof params === 'object' && params !== null
    ? (params.codigoVecino || params.codigo_vecino || params.code || '')
    : params;

  if (!code || typeof code !== 'string') {
    return { found: false, profile: null, error: 'Código de vecino no proporcionado.' };
  }

  const cleanCode = code.trim();
  if (!cleanCode) {
    return { found: false, profile: null, error: 'Código de vecino vacío.' };
  }

  try {
    // 1. Búsqueda principal por `codigo_vecino` (insensible a mayúsculas/minúsculas)
    const { data: matchCode, error: codeErr } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, direccion, telefono, puntos_reciclaje, puntos_acumulados, activo, estado_suscripcion, rol, codigo_vecino, avatar_url')
      .ilike('codigo_vecino', cleanCode)
      .maybeSingle();

    if (codeErr) {
      console.warn('[affiliate.js] Advertencia consultando por codigo_vecino:', codeErr.message);
    }

    if (matchCode) {
      return {
        found: true,
        profile: {
          ...matchCode,
          puntos_reciclaje: matchCode.puntos_reciclaje ?? matchCode.puntos_acumulados ?? 0,
        },
      };
    }

    // 2. Fallback: Búsqueda por UUID `id` si el código cumple formato UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanCode);
    if (isUuid) {
      const { data: matchId, error: idErr } = await supabase
        .from('perfiles')
        .select('id, nombre_completo, direccion, telefono, puntos_reciclaje, puntos_acumulados, activo, estado_suscripcion, rol, codigo_vecino, avatar_url')
        .eq('id', cleanCode)
        .maybeSingle();

      if (idErr) {
        console.warn('[affiliate.js] Advertencia consultando por UUID:', idErr.message);
      }

      if (matchId) {
        return {
          found: true,
          profile: {
            ...matchId,
            puntos_reciclaje: matchId.puntos_reciclaje ?? matchId.puntos_acumulados ?? 0,
          },
        };
      }
    }

    // 3. Fallback inteligente: buscar en perfiles recientes si el código coincide parcialmente
    const { data: recentProfiles } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, direccion, telefono, puntos_reciclaje, puntos_acumulados, activo, estado_suscripcion, rol, codigo_vecino, avatar_url')
      .limit(60);

    if (recentProfiles && recentProfiles.length > 0) {
      const normalizedQuery = cleanCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const foundCandidate = recentProfiles.find((p) => {
        const cVecino = (p.codigo_vecino || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (cVecino && (cVecino === normalizedQuery || cVecino.includes(normalizedQuery))) {
          return true;
        }
        const shortUuid = (p.id || '').replace(/-/g, '').substring(0, 6).toUpperCase();
        if (shortUuid && (shortUuid === normalizedQuery || normalizedQuery.includes(shortUuid))) {
          return true;
        }
        return false;
      });

      if (foundCandidate) {
        return {
          found: true,
          profile: {
            ...foundCandidate,
            puntos_reciclaje: foundCandidate.puntos_reciclaje ?? foundCandidate.puntos_acumulados ?? 0,
          },
        };
      }
    }

    return {
      found: false,
      profile: null,
      error: `No se encontró ningún ciudadano con el código de vecino "${cleanCode}".`,
    };
  } catch (err) {
    console.error('[affiliate.js] Excepción validando vecino:', err);
    return { found: false, profile: null, error: err.message };
  }
};

export const validateCitizenForRedemption = validateRedemption;

/**
 * Procesa el canje en el comercio afiliado:
 * 1. Busca al cliente en Supabase `perfiles` utilizando `codigo_vecino` (en lugar del UUID).
 * 2. Valida saldo de puntos del cliente en `perfiles`.
 * 3. Ejecuta 3 defensas lógicas estrictas antes de debitar puntos:
 *    - Cooldown Antifraude (30 minutos en el mismo comercio).
 *    - Vencimiento (fecha_fin < new Date()).
 *    - Control de Stock (limite_canjes <= 0 lanza "Oferta agotada", si es exitoso resta 1).
 * 4. Deduce los puntos del cliente en `perfiles`.
 * 5. Registra el canje en `historial_canjes` con `estado_liquidacion = 'pendiente_pago_a_ecoruta'`.
 * 
 * @param {object} param0
 * @param {string} param0.affiliateId - UUID del comercio afiliado
 * @param {string} [param0.affiliateName] - Nombre del comercio
 * @param {string} [param0.codigoVecino] - Código de vecino del ciudadano (ej. "P-A1B2C3")
 * @param {string} [param0.clientId] - UUID o código del ciudadano
 * @param {string|number} [param0.offerId] - ID de la oferta del catálogo (opcional)
 * @param {string|number} [param0.ofertaId] - Alias ID de la oferta
 * @param {number} [param0.limiteCanjes] - Límite de canjes (stock)
 * @param {number} [param0.limite_canjes] - Límite de canjes en BD
 * @param {string} [param0.fechaFin] - Fecha de vencimiento
 * @param {string} [param0.fecha_fin] - Fecha de vencimiento en BD
 * @param {number} param0.purchaseAmount - Monto total de la compra en Q
 * @param {number} param0.pointsToRedeem - Puntos a debitar del cliente
 * @param {number} param0.discountAmount - Monto del descuento aplicado en Q
 * @param {string} [param0.receiptNo] - No. de ticket o factura interna
 * @returns {Promise<{ success: boolean, canje: object, nuevoSaldo: number }>}
 */
export const processRedemption = async ({
  affiliateId,
  affiliateName = 'Comercio Aliado de Palín',
  codigoVecino,
  clientId,
  offerId,
  ofertaId,
  limiteCanjes,
  limite_canjes,
  fechaFin,
  fecha_fin,
  purchaseAmount,
  pointsToRedeem,
  discountAmount,
  receiptNo = '',
}) => {
  if (!clientId && !codigoVecino) {
    throw new Error('Identificador de cliente o código de vecino requerido.');
  }
  if (!affiliateId) {
    throw new Error('Identificador del comercio afiliado requerido.');
  }

  const points = parseInt(pointsToRedeem, 10);
  if (isNaN(points) || points <= 0) {
    throw new Error('La cantidad de eco-puntos a canjear debe ser mayor a 0.');
  }

  // 1. Consultar y validar saldo real del cliente en `perfiles` buscando por `codigo_vecino`
  let clientProfile = null;
  const isUuid = clientId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId);

  if (codigoVecino || (!isUuid && clientId)) {
    const codeQuery = (codigoVecino || clientId).trim();
    const { data: byCode } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, puntos_reciclaje, puntos_acumulados, codigo_vecino')
      .ilike('codigo_vecino', codeQuery)
      .maybeSingle();

    if (byCode) {
      clientProfile = byCode;
    }
  }

  if (!clientProfile && clientId) {
    const { data: byId, error: profileErr } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, puntos_reciclaje, puntos_acumulados, codigo_vecino')
      .eq('id', clientId)
      .maybeSingle();

    if (!profileErr && byId) {
      clientProfile = byId;
    }
  }

  // Fallback por búsqueda normalizada
  if (!clientProfile && (codigoVecino || clientId)) {
    const norm = (codigoVecino || clientId).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const { data: recents } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, puntos_reciclaje, puntos_acumulados, codigo_vecino')
      .limit(60);

    if (recents) {
      const match = recents.find((p) => {
        const cV = (p.codigo_vecino || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        return cV && (cV === norm || cV.includes(norm));
      });
      if (match) clientProfile = match;
    }
  }

  if (!clientProfile) {
    throw new Error(`No se pudo verificar el perfil del cliente para el código "${codigoVecino || clientId}".`);
  }

  const resolvedClientId = clientProfile.id;
  const currentPoints = clientProfile.puntos_reciclaje ?? clientProfile.puntos_acumulados ?? 0;
  if (currentPoints < points) {
    throw new Error(
      `Saldo insuficiente. El cliente tiene ${currentPoints} puntos disponibles y se requieren ${points} puntos para este descuento.`
    );
  }

  // Resolver comercio_id FK en tabla `comercios` si existe
  let realComercioId = null;
  try {
    const { data: com } = await supabase
      .from('comercios')
      .select('id')
      .eq('perfil_id', affiliateId)
      .maybeSingle();
    if (com?.id) {
      realComercioId = com.id;
    }
  } catch (e) {
    // ignorar
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ── DEFENSAS LÓGICAS ESTRICTAS (ANTES DE DESCONTAR LOS PUNTOS AL CLIENTE) ───
  // ─────────────────────────────────────────────────────────────────────────────

  // 1. COOLDOWN ANTIFRAUDE (30 MINUTOS):
  // Consulta `historial_canjes`. Si el mismo cliente_id canjeó en este comercio_id
  // hace menos de 30 minutos, lanza un error:
  // "Bloqueo de seguridad: Espera 30 minutos para un nuevo canje aquí".
  const now = new Date();
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

  try {
    const { data: recentCanjes, error: recentErr } = await supabase
      .from('historial_canjes')
      .select('*')
      .eq('cliente_id', resolvedClientId)
      .order('fecha_canje', { ascending: false })
      .limit(20);

    if (recentErr) {
      console.warn('[affiliate.js] Advertencia consultando historial_canjes para cooldown:', recentErr.message);
    }

    if (recentCanjes && recentCanjes.length > 0) {
      const hasRecentInSameMerchant = recentCanjes.some((c) => {
        const dateStr = c.fecha_canje || c.created_at;
        if (!dateStr) return false;
        const cDate = new Date(dateStr);
        if (isNaN(cDate.getTime())) return false;

        // Verificar si fue hace menos de 30 minutos
        if (cDate < thirtyMinutesAgo) return false;

        // Verificar si pertenece al mismo comercio
        const matchId =
          c.comercio_id === affiliateId ||
          (realComercioId && c.comercio_id === realComercioId) ||
          c.detalles?.afiliado_id === affiliateId ||
          (realComercioId && c.detalles?.comercio_id === realComercioId);

        const matchName =
          affiliateName &&
          c.comercio &&
          c.comercio.trim().toLowerCase() === affiliateName.trim().toLowerCase();

        return Boolean(matchId || matchName);
      });

      if (hasRecentInSameMerchant) {
        throw new Error('Bloqueo de seguridad: Espera 30 minutos para un nuevo canje aquí');
      }
    }
  } catch (cdErr) {
    if (cdErr.message && cdErr.message.includes('Bloqueo de seguridad')) {
      throw cdErr;
    }
    console.error('[affiliate.js] Error verificando cooldown antifraude:', cdErr);
  }

  // Consultar oferta asociada en `catalogo_incentivos` si se especificó offerId
  let offerRecord = null;
  const targetOfferId = offerId || ofertaId;
  if (targetOfferId) {
    try {
      const { data: offData, error: offErr } = await supabase
        .from('catalogo_incentivos')
        .select('*')
        .eq('id', targetOfferId)
        .maybeSingle();

      if (!offErr && offData) {
        offerRecord = offData;
      }
    } catch (e) {
      console.warn('[affiliate.js] Advertencia consultando catalogo_incentivos:', e.message);
    }
  }

  // 2. VENCIMIENTO:
  // Si fecha_fin existe y es menor a new Date(), lanza error "Oferta vencida".
  const rawFechaFin = offerRecord
    ? (offerRecord.fecha_fin || offerRecord.fecha_vencimiento)
    : (fecha_fin || fechaFin);

  if (rawFechaFin) {
    const expiryDate = new Date(rawFechaFin);
    if (!isNaN(expiryDate.getTime()) && expiryDate < new Date()) {
      throw new Error('Oferta vencida');
    }
  }

  // 3. CONTROL DE STOCK:
  // Si limite_canjes no es nulo y es <= 0, lanza error "Oferta agotada".
  const rawLimit = offerRecord
    ? (offerRecord.limite_canjes !== undefined && offerRecord.limite_canjes !== null
        ? offerRecord.limite_canjes
        : offerRecord.stock)
    : (limite_canjes !== undefined && limite_canjes !== null
        ? limite_canjes
        : (limiteCanjes !== undefined && limiteCanjes !== null ? limiteCanjes : null));

  if (rawLimit !== null && rawLimit !== undefined && rawLimit !== '') {
    const numLimit = Number(rawLimit);
    if (!isNaN(numLimit) && numLimit <= 0) {
      throw new Error('Oferta agotada');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ── DESCONTAR PUNTOS Y REGISTRAR CANJE (DESPUÉS DE VALIDACIONES) ─────────────
  // ─────────────────────────────────────────────────────────────────────────────

  // 4. Calcular nuevo saldo y descontar en `perfiles`
  const nuevoSaldo = Math.max(0, currentPoints - points);
  const { error: updateProfileErr } = await supabase
    .from('perfiles')
    .update({
      puntos_reciclaje: nuevoSaldo,
      ...(clientProfile.puntos_acumulados !== undefined ? { puntos_acumulados: nuevoSaldo } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', resolvedClientId);

  if (updateProfileErr) {
    console.error('[affiliate.js] Error deduciendo puntos de cliente:', updateProfileErr);
    throw new Error('No se pudo descontar los puntos del cliente en Supabase.');
  }

  // 5. Registrar en `historial_canjes` con `estado_liquidacion = 'pendiente_pago_a_ecoruta'` (Modelo CPA)
  const canjePayload = {
    cliente_id: resolvedClientId,
    comercio: affiliateName,
    comercio_id: realComercioId || affiliateId,
    puntos_descontados: points,
    monto_compra: parseFloat(purchaseAmount || 0),
    monto_descuento: parseFloat(discountAmount || 0),
    estado: 'completado',
    estado_liquidacion: 'pendiente_pago_a_ecoruta', // Requerimiento estricto CPA: El comercio le paga a EcoRuta
    fecha_canje: new Date().toISOString(),
    detalles: {
      afiliado_id: affiliateId,
      afiliado_nombre: affiliateName,
      comercio_id: realComercioId || affiliateId,
      codigo_vecino: clientProfile.codigo_vecino || codigoVecino || null,
      ticket_comercio: receiptNo || `TKT-${Date.now().toString().slice(-6)}`,
      tipo: 'descuento_en_tienda',
      comision_ecoruta: 1.50, // Tarifa CPA fija por cliente referido
      oferta_id: offerRecord?.id || targetOfferId || null,
      oferta_nombre: offerRecord?.nombre || null,
    },
  };

  let insertedCanje = null;
  try {
    const { data: canjeData, error: canjeErr } = await supabase
      .from('historial_canjes')
      .insert([canjePayload])
      .select()
      .maybeSingle();

    if (canjeErr) {
      console.warn('[affiliate.js] Advertencia insertando canje completo, probando esquema base:', canjeErr.message);
      // Fallback a campos estándar de `historial_canjes`
      const fallbackCanje = {
        cliente_id: resolvedClientId,
        puntos_descontados: points,
        estado: 'completado',
        estado_liquidacion: 'pendiente_pago_a_ecoruta',
        fecha_canje: new Date().toISOString(),
      };
      const { data: fbData, error: fbErr } = await supabase
        .from('historial_canjes')
        .insert([fallbackCanje])
        .select()
        .maybeSingle();

      if (fbErr) {
        console.error('[affiliate.js] Error guardando canje en historial_canjes:', fbErr);
      }
      insertedCanje = fbData || fallbackCanje;
    } else {
      insertedCanje = canjeData;
    }
  } catch (err) {
    console.error('[affiliate.js] Excepción registrando canje:', err);
    insertedCanje = canjePayload;
  }

  // 6. Resta 1 a `limite_canjes` si el canje fue exitoso
  if (offerRecord && rawLimit !== null && rawLimit !== undefined && rawLimit !== '') {
    const currentLimit = Number(rawLimit);
    if (!isNaN(currentLimit) && currentLimit > 0) {
      const updatedLimit = Math.max(0, currentLimit - 1);
      try {
        const { error: updLimitErr } = await supabase
          .from('catalogo_incentivos')
          .update({
            limite_canjes: updatedLimit,
            stock: updatedLimit,
            ...(updatedLimit === 0 ? { activo: false } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq('id', offerRecord.id);

        if (updLimitErr) {
          // Fallback a solo columna stock si limite_canjes no existe
          await supabase
            .from('catalogo_incentivos')
            .update({
              stock: updatedLimit,
              updated_at: new Date().toISOString(),
            })
            .eq('id', offerRecord.id);
        }
      } catch (updEx) {
        console.warn('[affiliate.js] Advertencia actualizando limite_canjes:', updEx.message);
      }
    }
  }

  return {
    success: true,
    canje: insertedCanje || canjePayload,
    nuevoSaldo,
  };
};

export const processAffiliateDiscount = processRedemption;

/**
 * Consulta el estado de cuenta y saldo a pagar a EcoRuta (Modelo CPA estricto):
 * El comercio debe pagar a EcoRuta una comisión fija de Q1.50 por cada cliente referido (canje pendiente).
 * Saldo Total a pagar = (canjes pendientes * 1.50).
 * 
 * @param {string} affiliateId - UUID del comercio afiliado
 * @param {string} [affiliateName] - Nombre del comercio
 * @returns {Promise<{ totalPendiente: number, totalPuntos: number, comisionPorReferido: number, canjesPendientes: Array, canjesLiquidados: Array }>}
 */
export const getAffiliateSettlementData = async (affiliateId, affiliateName = '') => {
  try {
    const { data, error } = await supabase
      .from('historial_canjes')
      .select('*')
      .order('fecha_canje', { ascending: false });

    if (error) {
      console.warn('[affiliate.js] Error consultando historial_canjes:', error.message);
      return {
        totalPendiente: 0,
        totalPuntos: 0,
        comisionPorReferido: 1.5,
        canjesPendientes: [],
        canjesLiquidados: [],
      };
    }

    const allCanjes = data || [];

    // Filtrar los correspondientes a este afiliado (por affiliateId en detalles o por nombre de comercio)
    const myCanjes = allCanjes.filter((c) => {
      const matchId = c.detalles?.afiliado_id === affiliateId;
      const matchName = affiliateName && c.comercio && c.comercio.toLowerCase().includes(affiliateName.toLowerCase());
      const isPendingStatus =
        c.estado_liquidacion === 'pendiente_pago_a_ecoruta' ||
        c.estado_liquidacion === 'pendiente_pago_a_socio';
      return matchId || matchName || isPendingStatus;
    });

    const pendientes = myCanjes.filter(
      (c) =>
        c.estado_liquidacion === 'pendiente_pago_a_ecoruta' ||
        c.estado_liquidacion === 'pendiente_pago_a_socio'
    );

    const liquidados = myCanjes.filter(
      (c) => c.estado_liquidacion === 'liquidado' || c.estado_liquidacion === 'pagado'
    );

    // Modelo CPA estricto: El comercio le paga a EcoRuta Q1.50 por cliente referido
    const COMISION_CPA_POR_CLIENTE = 1.5;
    const totalPendiente = parseFloat((pendientes.length * COMISION_CPA_POR_CLIENTE).toFixed(2));

    const totalPuntos = pendientes.reduce((acc, curr) => {
      return acc + (curr.puntos_descontados || 0);
    }, 0);

    return {
      totalPendiente,
      totalPuntos,
      comisionPorReferido: COMISION_CPA_POR_CLIENTE,
      canjesPendientes: pendientes,
      canjesLiquidados: liquidados,
    };
  } catch (err) {
    console.error('[affiliate.js] Error obteniendo estado de cuenta CPA:', err);
    return {
      totalPendiente: 0,
      totalPuntos: 0,
      comisionPorReferido: 1.5,
      canjesPendientes: [],
      canjesLiquidados: [],
    };
  }
};

/**
 * Registra el pago B2B de comisiones CPA que el comercio le paga a EcoRuta:
 * 1. Inserta en la tabla `pagos_comercios` con `comercio_id`, `monto`, `metodo_pago` y `concepto: 'pago_comisiones_cpa'`.
 * 2. Actualiza en cascada `estado_liquidacion = 'pagado'` en los registros de `historial_canjes` que estaban pendientes.
 * 
 * @param {object} param0
 * @param {string} param0.affiliateId - UUID del comercio afiliado
 * @param {string} [param0.affiliateName] - Nombre del comercio
 * @param {number} param0.amount - Monto total a pagar
 * @param {string} param0.paymentMethod - 'transferencia' | 'tarjeta'
 * @param {string} [param0.receiptNo] - No. de boleta o transacción
 * @param {string} [param0.voucherUrl] - URL o Base64 del voucher
 * @param {Array<string|number>} [param0.pendingCanjeIds] - IDs de los canjes a liquidar
 * @param {object} [param0.details] - Metadatos adicionales
 * @returns {Promise<{ success: boolean, payment: object, updatedCanjes: number }>}
 */
export const recordAffiliateCommissionPayment = async ({
  affiliateId,
  affiliateName = '',
  amount,
  paymentMethod,
  receiptNo = '',
  voucherUrl = null,
  pendingCanjeIds = [],
  details = {},
}) => {
  if (!affiliateId) {
    throw new Error('El ID del comercio afiliado es obligatorio para registrar el pago.');
  }

  const cleanAmount = parseFloat(amount || 0);
  if (isNaN(cleanAmount) || cleanAmount <= 0) {
    throw new Error('El monto de liquidación debe ser mayor a Q0.00.');
  }

  const generatedRef = receiptNo || `B2B-${Date.now().toString().slice(-6)}`;
  const estadoPago = paymentMethod === 'tarjeta' ? 'aprobado' : 'pendiente';

  // 1. Insertar el pago en `pagos_comercios`
  const paymentPayload = {
    comercio_id: affiliateId,
    monto: cleanAmount,
    metodo_pago: paymentMethod, // 'transferencia' | 'tarjeta'
    concepto: 'pago_comisiones_cpa', // Requerimiento estricto
    estado: estadoPago,
    no_referencia: generatedRef,
    comprobante_url: voucherUrl,
    detalles: {
      comercio_nombre: affiliateName,
      canal: 'Pasarela B2B EcoRuta',
      total_canjes_liquidados: pendingCanjeIds.length,
      comision_unitaria: 1.5,
      fecha_pago: new Date().toISOString(),
      ...details,
    },
    fecha_pago: new Date().toISOString(),
  };

  let insertedRecord = null;
  try {
    const { data: payData, error: payErr } = await supabase
      .from('pagos_comercios')
      .insert([paymentPayload])
      .select()
      .maybeSingle();

    if (payErr) {
      console.warn('[affiliate.js] Advertencia insertando en pagos_comercios con detalles, probando esquema base:', payErr.message);
      // Fallback esquema estándar
      const fallbackPayload = {
        comercio_id: affiliateId,
        monto: cleanAmount,
        metodo_pago: paymentMethod,
        concepto: 'pago_comisiones_cpa',
        estado: estadoPago,
      };
      const { data: fbData, error: fbErr } = await supabase
        .from('pagos_comercios')
        .insert([fallbackPayload])
        .select()
        .maybeSingle();

      if (fbErr) {
        console.error('[affiliate.js] Error en tabla pagos_comercios:', fbErr);
      }
      insertedRecord = fbData || fallbackPayload;
    } else {
      insertedRecord = payData;
    }
  } catch (err) {
    console.error('[affiliate.js] Excepción insertando pago de comisiones B2B:', err);
    insertedRecord = paymentPayload;
  }

  // 2. Actualizar en cascada `estado_liquidacion` a 'pagado' en `historial_canjes`
  let updatedCanjes = 0;
  try {
    if (pendingCanjeIds && pendingCanjeIds.length > 0) {
      const { data: updData, error: updErr } = await supabase
        .from('historial_canjes')
        .update({
          estado_liquidacion: 'pagado',
          updated_at: new Date().toISOString(),
        })
        .in('id', pendingCanjeIds)
        .select('id');

      if (updErr) {
        console.warn('[affiliate.js] Falló actualización por IDs específicos, intentando actualización general:', updErr.message);
        // Fallback por estado
        const { error: fbUpdErr } = await supabase
          .from('historial_canjes')
          .update({
            estado_liquidacion: 'pagado',
          })
          .in('estado_liquidacion', ['pendiente_pago_a_ecoruta', 'pendiente_pago_a_socio']);

        if (fbUpdErr) {
          console.error('[affiliate.js] Error en fallback de actualización de canjes:', fbUpdErr);
        }
      } else {
        updatedCanjes = updData?.length || pendingCanjeIds.length;
      }
    } else {
      // Si no hay lista de IDs, actualizar todos los pendientes asociados
      const { error: updAllErr } = await supabase
        .from('historial_canjes')
        .update({
          estado_liquidacion: 'pagado',
        })
        .in('estado_liquidacion', ['pendiente_pago_a_ecoruta', 'pendiente_pago_a_socio']);

      if (updAllErr) {
        console.error('[affiliate.js] Error actualizando historial_canjes:', updAllErr);
      }
    }
  } catch (updEx) {
    console.error('[affiliate.js] Excepción actualizando historial_canjes a pagado:', updEx);
  }

  return {
    success: true,
    payment: insertedRecord || paymentPayload,
    updatedCanjes,
  };
};

/**
 * Consulta las ofertas e incentivos propuestos por el comercio afiliado:
 * @param {string} affiliateId - UUID del comercio
 * @param {string} [affiliateName] - Nombre del comercio
 * @returns {Promise<Array>} Lista de ofertas
 */
export const getAffiliateOffers = async (affiliateId, affiliateName = '') => {
  try {
    // Buscar si existe el id en la tabla comercios correspondiente al perfil
    let realComercioId = null;
    try {
      const { data: com } = await supabase
        .from('comercios')
        .select('id')
        .eq('perfil_id', affiliateId)
        .maybeSingle();
      if (com?.id) {
        realComercioId = com.id;
      }
    } catch (e) {
      // Continúa con fallback
    }

    let { data, error } = await supabase
      .from('catalogo_incentivos')
      .select('*')
      .order('fecha_creacion', { ascending: false });

    if (error) {
      console.warn('[affiliate.js] Falló ordenar por fecha_creacion, consultando sin orden:', error.message);
      const rawRes = await supabase.from('catalogo_incentivos').select('*');
      data = rawRes.data;
      error = rawRes.error;
    }

    if (error) {
      console.warn('[affiliate.js] Error consultando catalogo_incentivos:', error.message);
      return [];
    }

    const all = data || [];
    return all.filter((item) => {
      const matchId =
        (realComercioId && item.comercio_id === realComercioId) ||
        item.comercio_id === affiliateId;
      const matchName =
        affiliateName &&
        item.comercio &&
        item.comercio.toLowerCase().includes(affiliateName.toLowerCase());
      return matchId || matchName;
    });
  } catch (err) {
    console.error('[affiliate.js] Excepción obteniendo ofertas del afiliado:', err);
    return [];
  }
};

/**
 * Inserta una nueva propuesta de oferta en `catalogo_incentivos`:
 * Estado inicial: `estado_aprobacion: 'revision_admin'` y `activo: false`.
 * 
 * @param {object} param0
 * @param {string} param0.affiliateId - UUID del comercio
 * @param {string} [param0.affiliateName] - Nombre del comercio
 * @param {string} param0.nombre - Nombre de la oferta
 * @param {string} param0.descripcion - Descripción
 * @param {number|string} param0.costoPuntos - Puntos requeridos
 * @param {number|string} [param0.stock=25] - Stock disponible
 * @param {number|string} [param0.limiteCanjes] - Límite de canjes (stock opcional)
 * @param {number|string} [param0.limite_canjes] - Límite de canjes en BD
 * @param {string} [param0.fechaVencimiento] - Fecha de vencimiento (opcional, ej. AAAA-MM-DD)
 * @param {string} [param0.fechaFin] - Fecha de fin
 * @param {string} [param0.fecha_fin] - Fecha de fin en BD
 * @param {string} [param0.categoria] - Categoría
 * @param {string} [param0.tipoPromocion='Descuento (Q)'] - Tipo de promoción: 'Descuento (Q)', 'Porcentaje (%)' o 'Promoción 2x1'
 * @param {string} [param0.imagenUrl] - Imagen o icono
 * @returns {Promise<{ success: boolean, offer: object }>}
 */
export const proposeAffiliateOffer = async ({
  affiliateId,
  affiliateName = 'Comercio Local',
  nombre,
  descripcion,
  costoPuntos,
  stock = 25,
  limiteCanjes = null,
  limite_canjes = null,
  fechaVencimiento = null,
  fechaFin = null,
  fecha_fin = null,
  categoria = 'Comercio Local',
  tipoPromocion = 'Descuento (Q)',
  imagenUrl = null,
}) => {
  if (!nombre?.trim() || !descripcion?.trim()) {
    throw new Error('El nombre y la descripción de la oferta son obligatorios.');
  }

  const puntosNum = parseInt(costoPuntos, 10);
  if (isNaN(puntosNum) || puntosNum <= 0) {
    throw new Error('Los puntos requeridos deben ser un número entero mayor a 0.');
  }

  const stockNum = parseInt(stock || 0, 10);
  const rawLimit = limite_canjes !== null && limite_canjes !== undefined
    ? parseInt(limite_canjes, 10)
    : (limiteCanjes !== null && limiteCanjes !== undefined ? parseInt(limiteCanjes, 10) : null);
  const effectiveLimit = rawLimit !== null ? rawLimit : (isNaN(stockNum) ? 25 : stockNum);

  const rawExpiry = (fecha_fin || fechaFin || fechaVencimiento || '').toString().trim();
  const effectiveExpiry = rawExpiry || null;

  // 1. Resolver la FK hacia 'comercios': affiliateId es el ID del perfil
  let realComercioId = null;
  const { data: existingComercio, error: searchComercioErr } = await supabase
    .from('comercios')
    .select('id')
    .eq('perfil_id', affiliateId)
    .maybeSingle();

  if (searchComercioErr) {
    console.warn('[affiliate.js] Advertencia buscando en tabla comercios:', searchComercioErr.message);
  }

  if (existingComercio?.id) {
    realComercioId = existingComercio.id;
  } else {
    // Si la consulta no devuelve nada, inserta el comercio automáticamente
    const { data: newComercio, error: insertComercioErr } = await supabase
      .from('comercios')
      .insert({
        perfil_id: affiliateId,
        nombre_negocio: affiliateName,
      })
      .select('id')
      .single();

    if (insertComercioErr) {
      console.error('[affiliate.js] Error insertando en tabla comercios:', insertComercioErr);
      throw new Error(`Fallo al registrar comercio en Supabase: ${insertComercioErr.message}`);
    }
    realComercioId = newComercio?.id;
  }

  const nowIso = new Date().toISOString();

  // 2. Payload limpio: con limite_canjes, fecha_fin, stock y fecha_vencimiento
  const payload = {
    comercio_id: realComercioId,
    nombre: nombre.trim(),
    descripcion: descripcion.trim(),
    puntos_requeridos: puntosNum,
    costo_puntos: puntosNum,
    stock: effectiveLimit,
    limite_canjes: effectiveLimit,
    fecha_fin: effectiveExpiry,
    fecha_vencimiento: effectiveExpiry,
    comercio: affiliateName.trim(),
    categoria: (categoria || 'Comercio Local').trim(),
    tipo_promocion: (tipoPromocion || 'Descuento (Q)').trim(),
    activo: false, // Inactivo hasta aprobación admin
    estado_aprobacion: 'revision_admin', // Requerimiento estricto
    notas_admin: null,
    imagen_url: imagenUrl,
    fecha_creacion: nowIso,
  };

  try {
    const { data, error } = await supabase
      .from('catalogo_incentivos')
      .insert([payload])
      .select()
      .maybeSingle();

    if (error) {
      console.warn('[affiliate.js] Falló inserción detallada de oferta, probando base:', error.message);
      const fallbackPayload = {
        comercio_id: realComercioId,
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        puntos_requeridos: puntosNum,
        costo_puntos: puntosNum,
        stock: effectiveLimit,
        comercio: affiliateName.trim(),
        categoria: (categoria || 'Comercio Local').trim(),
        tipo_promocion: (tipoPromocion || 'Descuento (Q)').trim(),
        activo: false,
        estado_aprobacion: 'revision_admin',
        notas_admin: null,
        fecha_creacion: nowIso,
      };
      const { data: fbData, error: fbErr } = await supabase
        .from('catalogo_incentivos')
        .insert([fallbackPayload])
        .select()
        .maybeSingle();

      if (fbErr) {
        console.warn('[affiliate.js] Falló fallback base, intentando con campos esenciales:', fbErr.message);
        const minimalPayload = {
          comercio_id: realComercioId,
          nombre: nombre.trim(),
          descripcion: descripcion.trim(),
          puntos_requeridos: puntosNum,
          stock: effectiveLimit,
          comercio: affiliateName.trim(),
          categoria: (categoria || 'Comercio Local').trim(),
          activo: false,
          estado_aprobacion: 'revision_admin',
          fecha_creacion: nowIso,
        };
        const { data: minData, error: minErr } = await supabase
          .from('catalogo_incentivos')
          .insert([minimalPayload])
          .select()
          .maybeSingle();

        if (minErr) {
          console.error('[affiliate.js] Error insertando oferta:', minErr);
          throw new Error(minErr.message || 'No se pudo guardar la oferta en Supabase.');
        }
        return { success: true, offer: minData || minimalPayload };
      }
      return { success: true, offer: fbData || fallbackPayload };
    }

    return { success: true, offer: data || payload };
  } catch (err) {
    console.error('[affiliate.js] Excepción creando propuesta de oferta:', err);
    throw err;
  }
};

/**
 * Responde a una contrapropuesta de la administración:
 * - Aceptar: cambia `estado_aprobacion` a 'aprobado' y activa la oferta (`activo: true`).
 * - Rechazar: cambia `estado_aprobacion` a 'rechazado' y desactiva la oferta (`activo: false`).
 * 
 * @param {string|number} offerId - ID de la oferta
 * @param {boolean} accept - true para aceptar, false para rechazar
 * @returns {Promise<{ success: boolean, nuevoEstado: string, offer: object }>}
 */
export const respondToOfferCounterProposal = async (offerId, accept = true) => {
  if (!offerId) {
    throw new Error('El ID de la oferta es obligatorio.');
  }

  const nuevoEstado = accept ? 'aprobado' : 'rechazado';
  const activo = Boolean(accept);

  try {
    const { data, error } = await supabase
      .from('catalogo_incentivos')
      .update({
        estado_aprobacion: nuevoEstado,
        activo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', offerId)
      .select()
      .maybeSingle();

    if (error) {
      console.error('[affiliate.js] Error respondiendo a contrapropuesta:', error);
      throw new Error(error.message || 'No se pudo actualizar la contrapropuesta.');
    }

    return {
      success: true,
      nuevoEstado,
      offer: data,
    };
  } catch (err) {
    console.error('[affiliate.js] Excepción actualizando contrapropuesta:', err);
    throw err;
  }
};

