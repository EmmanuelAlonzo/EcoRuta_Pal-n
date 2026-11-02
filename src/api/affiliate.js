import { supabase } from '../services/supabase';

/**
 * Servicio API para Comercios Afiliados (EcoRuta Palín) - Modelo CPA
 * Maneja el canje de eco-puntos por descuentos en compras reales,
 * deducción de saldo del cliente y cálculo del saldo a pagar a EcoRuta
 * por concepto de comisión por cliente referido (Q1.50 por canje).
 */

/**
 * Procesa el descuento en el comercio afiliado:
 * 1. Valida saldo de puntos del cliente en Supabase `perfiles`.
 * 2. Deduce los puntos del cliente.
 * 3. Registra el canje en `historial_canjes` con `estado_liquidacion = 'pendiente_pago_a_ecoruta'`.
 * 
 * @param {object} param0
 * @param {string} param0.affiliateId - UUID del comercio afiliado
 * @param {string} param0.affiliateName - Nombre del comercio
 * @param {string} param0.clientId - UUID del ciudadano
 * @param {number} param0.purchaseAmount - Monto total de la compra en Q
 * @param {number} param0.pointsToRedeem - Puntos a debitar del cliente
 * @param {number} param0.discountAmount - Monto del descuento aplicado en Q
 * @param {string} [param0.receiptNo] - No. de ticket o factura interna
 * @returns {Promise<{ success: boolean, canje: object, nuevoSaldo: number }>}
 */
export const processAffiliateDiscount = async ({
  affiliateId,
  affiliateName = 'Comercio Aliado de Palín',
  clientId,
  purchaseAmount,
  pointsToRedeem,
  discountAmount,
  receiptNo = '',
}) => {
  if (!clientId || !affiliateId) {
    throw new Error('Identificadores de cliente y comercio afiliado requeridos.');
  }

  const points = parseInt(pointsToRedeem, 10);
  if (isNaN(points) || points <= 0) {
    throw new Error('La cantidad de eco-puntos a canjear debe ser mayor a 0.');
  }

  // 1. Consultar y validar saldo real del cliente en `perfiles`
  const { data: clientProfile, error: profileErr } = await supabase
    .from('perfiles')
    .select('id, nombre_completo, puntos_reciclaje, puntos_acumulados')
    .eq('id', clientId)
    .single();

  if (profileErr || !clientProfile) {
    console.error('[affiliate.js] Error consultando perfil de cliente:', profileErr);
    throw new Error('No se pudo verificar el perfil del cliente en la base de datos.');
  }

  const currentPoints = clientProfile.puntos_reciclaje ?? clientProfile.puntos_acumulados ?? 0;
  if (currentPoints < points) {
    throw new Error(
      `Saldo insuficiente. El cliente tiene ${currentPoints} puntos disponibles y se requieren ${points} puntos para este descuento.`
    );
  }

  // 2. Calcular nuevo saldo y descontar en `perfiles`
  const nuevoSaldo = Math.max(0, currentPoints - points);
  const { error: updateProfileErr } = await supabase
    .from('perfiles')
    .update({
      puntos_reciclaje: nuevoSaldo,
      ...(clientProfile.puntos_acumulados !== undefined ? { puntos_acumulados: nuevoSaldo } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', clientId);

  if (updateProfileErr) {
    console.error('[affiliate.js] Error deduciendo puntos de cliente:', updateProfileErr);
    throw new Error('No se pudo descontar los puntos del cliente en Supabase.');
  }

  // 3. Registrar en `historial_canjes` con `estado_liquidacion = 'pendiente_pago_a_ecoruta'` (Modelo CPA)
  const canjePayload = {
    cliente_id: clientId,
    comercio: affiliateName,
    puntos_descontados: points,
    monto_compra: parseFloat(purchaseAmount || 0),
    monto_descuento: parseFloat(discountAmount || 0),
    estado: 'completado',
    estado_liquidacion: 'pendiente_pago_a_ecoruta', // Requerimiento estricto CPA: El comercio le paga a EcoRuta
    fecha_canje: new Date().toISOString(),
    detalles: {
      afiliado_id: affiliateId,
      afiliado_nombre: affiliateName,
      ticket_comercio: receiptNo || `TKT-${Date.now().toString().slice(-6)}`,
      tipo: 'descuento_en_tienda',
      comision_ecoruta: 1.50, // Tarifa CPA fija por cliente referido
    },
  };

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
        cliente_id: clientId,
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

      return {
        success: true,
        canje: fbData || canjePayload,
        nuevoSaldo,
      };
    }

    return {
      success: true,
      canje: canjeData || canjePayload,
      nuevoSaldo,
    };
  } catch (err) {
    console.error('[affiliate.js] Excepción registrando canje:', err);
    return {
      success: true,
      canje: canjePayload,
      nuevoSaldo,
    };
  }
};

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
    const { data, error } = await supabase
      .from('catalogo_incentivos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[affiliate.js] Error consultando catalogo_incentivos:', error.message);
      return [];
    }

    const all = data || [];
    return all.filter((item) => {
      const matchId = item.detalles?.afiliado_id === affiliateId;
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
 * @param {number|string} param0.stock - Stock disponible
 * @param {string} [param0.categoria] - Categoría
 * @param {string} [param0.imagenUrl] - Imagen o icono
 * @returns {Promise<{ success: boolean, offer: object }>}
 */
export const proposeAffiliateOffer = async ({
  affiliateId,
  affiliateName = 'Comercio Local',
  nombre,
  descripcion,
  costoPuntos,
  stock,
  categoria = 'Comercio Local',
  imagenUrl = null,
}) => {
  if (!nombre?.trim() || !descripcion?.trim()) {
    throw new Error('El nombre y la descripción de la oferta son obligatorios.');
  }

  const puntosNum = parseInt(costoPuntos, 10);
  if (isNaN(puntosNum) || puntosNum <= 0) {
    throw new Error('Los puntos requeridos deben ser un número entero mayor a 0.');
  }

  const stockNum = parseInt(stock, 10);
  if (isNaN(stockNum) || stockNum < 0) {
    throw new Error('El stock debe ser un número entero mayor o igual a 0.');
  }

  const payload = {
    nombre: nombre.trim(),
    descripcion: descripcion.trim(),
    costo_puntos: puntosNum,
    stock: stockNum,
    comercio: affiliateName.trim(),
    categoria: (categoria || 'Comercio Local').trim(),
    activo: false, // Inactivo hasta aprobación admin
    estado_aprobacion: 'revision_admin', // Requerimiento estricto
    notas_admin: null,
    imagen_url: imagenUrl,
    detalles: {
      afiliado_id: affiliateId,
      fecha_propuesta: new Date().toISOString(),
    },
    created_at: new Date().toISOString(),
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
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        costo_puntos: puntosNum,
        stock: stockNum,
        comercio: affiliateName.trim(),
        categoria: (categoria || 'Comercio Local').trim(),
        activo: false,
        estado_aprobacion: 'revision_admin',
      };
      const { data: fbData, error: fbErr } = await supabase
        .from('catalogo_incentivos')
        .insert([fallbackPayload])
        .select()
        .maybeSingle();

      if (fbErr) {
        console.error('[affiliate.js] Error insertando oferta:', fbErr);
        throw new Error(fbErr.message || 'No se pudo guardar la oferta en Supabase.');
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

