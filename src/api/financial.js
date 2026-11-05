import { supabase } from '../services/supabase';

/**
 * Servicio API Financiero para Clientes en EcoRuta Palín
 * Administra el pago de suscripciones del servicio privado de recolección (transferencia/tarjeta),
 * historial de pagos en `pagos_suscripcion` y catálogo de `comercios` afiliados.
 */

// Catálogo por defecto eliminado: todas las ofertas y comercios se nutren 100% desde Supabase
export const PALIN_AFFILIATED_MERCHANTS = [];

/**
 * Consulta la lista de incentivos/ofertas de comercios aliados en Supabase
 * @returns {Promise<Array>}
 */
export const getAffiliatedMerchants = async () => {
  try {
    // 1. Priorizar ofertas reales aprobadas y activas de catalogo_incentivos
    try {
      const { data: incentives, error: incError } = await supabase
        .from('catalogo_incentivos')
        .select('*')
        .eq('activo', true)
        .eq('estado_aprobacion', 'aprobado');

      if (!incError && incentives && incentives.length > 0) {
        return incentives.map((o) => ({
          id: o.id,
          nombre: o.comercio || o.nombre,
          descuento: o.nombre,
          descripcion: o.descripcion,
          categoria: o.categoria || 'Comercio Local',
          icono: (o.categoria || '').toLowerCase().includes('café')
            ? '☕'
            : (o.categoria || '').toLowerCase().includes('farmacia') || (o.categoria || '').toLowerCase().includes('salud')
            ? '💊'
            : (o.categoria || '').toLowerCase().includes('abarrotes')
            ? '🛒'
            : '🏪',
          puntos_requeridos: o.puntos_requeridos || o.costo_puntos || 50,
          tipo_promocion: o.tipo_promocion || 'Descuento (Q)',
          direccion: o.direccion || 'Palín, Escuintla',
          horario: o.horario || 'Lunes a Sábado',
          activo: true,
        }));
      }
    } catch (e) {
      console.warn('[financial.js] Falló consulta a catalogo_incentivos:', e.message);
    }

    // 2. Si no hay incentivos aprobados, consultar tabla comercios
    const { data, error } = await supabase
      .from('comercios')
      .select('*')
      .eq('activo', true)
      .order('nombre', { ascending: true });

    if (error) {
      console.warn('[financial.js] Tabla comercios en Supabase:', error.message);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.map((item) => ({
      ...item,
      tipo_promocion: item.tipo_promocion || 'Descuento (Q)',
    }));
  } catch (err) {
    console.warn('[financial.js] Error consultando comercios aliados en Supabase:', err.message);
    return [];
  }
};

/**
 * Registra una nueva transacción en la tabla `pagos_suscripcion` con estado 'pendiente'.
 * Soporta pago por transferencia (voucher) y pago en línea con tarjeta.
 * 
 * @param {object} param0
 * @param {string} param0.userId - UUID del cliente
 * @param {number} param0.monto - Monto de la cuota (ej. Q30.00)
 * @param {'transferencia'|'tarjeta'} param0.metodoPago
 * @param {string} [param0.comprobanteUrl] - URI o base64 de la imagen del voucher
 * @param {string} [param0.noReferencia] - Número de transacción o boleta bancaria
 * @param {object} [param0.detalles] - Información extra (últimos 4 dígitos, banco, etc.)
 * @returns {Promise<object>} Registro insertado
 */
export const createSubscriptionPayment = async ({
  userId,
  monto = 30.0,
  metodoPago = 'transferencia',
  comprobanteUrl = null,
  noReferencia = '',
  detalles = {},
}) => {
  if (!userId) {
    throw new Error('El ID del usuario es obligatorio para registrar el pago.');
  }

  const payload = {
    cliente_id: userId,
    monto: parseFloat(monto),
    metodo_pago: metodoPago,
    estado: 'pendiente', // Requerimiento estricto: estado 'pendiente'
    comprobante_url: comprobanteUrl || null,
    no_referencia: noReferencia || `PAL-${Date.now().toString().slice(-6)}`,
    detalles: typeof detalles === 'object' ? detalles : {},
    fecha_pago: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('pagos_suscripcion')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.warn('[financial.js] Error al insertar en pagos_suscripcion:', error.message);
      // Si la tabla aún no cuenta con alguna columna opcional, intentar inserción simplificada
      const fallbackPayload = {
        cliente_id: userId,
        monto: parseFloat(monto),
        metodo_pago: metodoPago,
        estado: 'pendiente',
      };

      const { data: fallbackData, error: fallbackError } = await supabase
        .from('pagos_suscripcion')
        .insert([fallbackPayload])
        .select()
        .single();

      if (fallbackError) {
        console.error('[financial.js] Inserción de respaldo falló:', fallbackError);
        throw fallbackError;
      }

      return fallbackData;
    }

    return data;
  } catch (err) {
    console.error('[financial.js] Excepción creando pago de suscripción:', err);
    throw err;
  }
};

/**
 * Consulta el historial de pagos de suscripción de un cliente
 * @param {string} userId - UUID del cliente
 * @returns {Promise<Array>}
 */
export const getSubscriptionPayments = async (userId) => {
  if (!userId) return [];

  try {
    const { data, error } = await supabase
      .from('pagos_suscripcion')
      .select('*')
      .eq('cliente_id', userId)
      .order('fecha_pago', { ascending: false });

    if (error) {
      console.warn('[financial.js] Consulta pagos_suscripcion:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.warn('[financial.js] Error al consultar pagos de suscripción:', err.message);
    return [];
  }
};

/**
 * Registra un cobro de suscripción en ruta realizado directamente por el operario (POS Móvil / Efectivo en camión).
 * Requerimiento 4: metodo_pago 'pos_operario' y estado 'aprobado'.
 * 
 * @param {object} param0
 * @param {string} param0.clientId - UUID del ciudadano
 * @param {number} [param0.amount=30.0] - Cuota del servicio privado
 * @param {string} param0.operatorId - UUID del operario
 * @param {string} [param0.operatorName] - Nombre del operario
 * @param {string} [param0.truckCode] - Código de unidad (ej. CAM-01)
 * @param {string} [param0.paymentType='efectivo'] - 'efectivo' | 'tarjeta_pos'
 * @param {string} [param0.receiptNo] - No. de recibo o transacción POS
 * @returns {Promise<object>} Registro de pago y perfil actualizado
 */
export const recordPosSubscriptionPayment = async ({
  clientId,
  amount = 30.0,
  operatorId,
  operatorName = 'Operaria de Ruta',
  truckCode = 'Unidad EcoRuta',
  paymentType = 'efectivo',
  receiptNo = '',
}) => {
  if (!clientId) {
    throw new Error('El ID del vecino/cliente es obligatorio para cobrar la suscripción.');
  }

  const generatedRef = receiptNo || `POS-${Date.now().toString().slice(-6)}`;

  const payload = {
    cliente_id: clientId,
    monto: parseFloat(amount),
    metodo_pago: 'pos_operario', // Requerimiento estricto: 'pos_operario'
    estado: 'aprobado',          // Requerimiento estricto: 'aprobado'
    no_referencia: generatedRef,
    detalles: {
      operario_id: operatorId,
      operario_nombre: operatorName,
      codigo_camion: truckCode,
      tipo_cobro: paymentType,
      canal: 'POS Operativo en Camión de Recolección EcoRuta',
      fecha_cobro: new Date().toISOString(),
    },
    fecha_pago: new Date().toISOString(),
  };

  try {
    // 1. Insertar el pago aprobado en `pagos_suscripcion`
    let paymentData = null;
    const { data, error } = await supabase
      .from('pagos_suscripcion')
      .insert([payload])
      .select()
      .maybeSingle();

    if (error) {
      console.warn('[financial.js] Inserción con detalles falló, intentando estructura base:', error.message);
      const fallbackPayload = {
        cliente_id: clientId,
        monto: parseFloat(amount),
        metodo_pago: 'pos_operario',
        estado: 'aprobado',
      };
      const { data: fbData, error: fbErr } = await supabase
        .from('pagos_suscripcion')
        .insert([fallbackPayload])
        .select()
        .maybeSingle();

      if (fbErr) {
        console.error('[financial.js] Error al registrar pago POS:', fbErr);
        throw fbErr;
      }
      paymentData = fbData;
    } else {
      paymentData = data;
    }

    // 2. Actualizar inmediatamente el estado del ciudadano en `perfiles`
    try {
      await supabase
        .from('perfiles')
        .update({
          activo: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', clientId);
    } catch (profileErr) {
      console.warn('[financial.js] Advertencia actualizando perfiles.activo:', profileErr);
    }

    return {
      success: true,
      payment: paymentData || payload,
      noReferencia: generatedRef,
    };
  } catch (err) {
    console.error('[financial.js] Error en recordPosSubscriptionPayment:', err);
    throw err;
  }
};

