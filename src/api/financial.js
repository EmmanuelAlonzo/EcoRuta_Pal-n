import { supabase } from '../services/supabase';

/**
 * Servicio API Financiero para Clientes en EcoRuta Palín
 * Administra el pago de suscripciones del servicio privado de recolección (transferencia/tarjeta),
 * historial de pagos en `pagos_suscripcion` y catálogo de `comercios` afiliados.
 */

// Catálogo por defecto de comercios aliados en Palín (fallback resiliente)
export const PALIN_AFFILIATED_MERCHANTS = [
  {
    id: 'merch-01',
    nombre: 'Supermercado La Bendición',
    categoria: 'Abarrotes y Alimentos',
    icono: '🛒',
    descuento: '15% de descuento en canasta básica',
    tipo_promocion: 'Porcentaje (%)',
    puntos_requeridos: 80,
    direccion: '4ta Calle 2-15, Zona 1, Palín, Escuintla',
    horario: 'Lunes a Domingo: 7:00 AM - 8:00 PM',
    telefono: '+502 7838-1200',
    activo: true,
  },
  {
    id: 'merch-02',
    nombre: 'Ferretería & Materiales El Quetzal',
    categoria: 'Hogar y Construcción',
    icono: '🔨',
    descuento: 'Q25.00 de descuento en compras mayores a Q100',
    tipo_promocion: 'Descuento (Q)',
    puntos_requeridos: 100,
    direccion: 'Avenida Principal 5-30, Zona 2, Palín',
    horario: 'Lunes a Sábado: 8:00 AM - 6:00 PM',
    telefono: '+502 7838-2345',
    activo: true,
  },
  {
    id: 'merch-03',
    nombre: 'Café & Panadería Volcán Palín',
    categoria: 'Cafetería y Repostería',
    icono: '☕',
    descuento: '1 Café tradicional + 2 panes artesanales (Promoción 2x1)',
    tipo_promocion: 'Promoción 2x1',
    puntos_requeridos: 50,
    direccion: 'Frente al Parque Central de Palín',
    horario: 'Lunes a Domingo: 6:30 AM - 7:30 PM',
    telefono: '+502 5522-8901',
    activo: true,
  },
  {
    id: 'merch-04',
    nombre: 'Farmacia y Droguería San Martín',
    categoria: 'Salud y Cuidado Personal',
    icono: '💊',
    descuento: '10% de descuento en medicamentos genéricos',
    tipo_promocion: 'Porcentaje (%)',
    puntos_requeridos: 60,
    direccion: 'Barrio San Pedro, Zona 3, Palín',
    horario: '24 Horas los 365 días',
    telefono: '+502 7838-4455',
    activo: true,
  },
  {
    id: 'merch-05',
    nombre: 'Taller & Repuestos Ecológicos Palín',
    categoria: 'Automotriz y Motos',
    icono: '🔧',
    descuento: 'Revisión preventiva gratis + 10% en mano de obra',
    tipo_promocion: 'Porcentaje (%)',
    puntos_requeridos: 120,
    direccion: 'Km 39 Carretera al Pacífico, Entrada a Palín',
    horario: 'Lunes a Sábado: 7:30 AM - 5:30 PM',
    telefono: '+502 4433-2211',
    activo: true,
  },
  {
    id: 'merch-06',
    nombre: 'Librería y Útiles Escolares Palín',
    categoria: 'Papelería y Educación',
    icono: '📚',
    descuento: 'Q15.00 de descuento en cuadernos y reciclaje',
    tipo_promocion: 'Descuento (Q)',
    puntos_requeridos: 40,
    direccion: '3ra Avenida 1-10, Zona 1, Palín',
    horario: 'Lunes a Viernes: 8:00 AM - 6:00 PM',
    telefono: '+502 5811-9034',
    activo: true,
  },
];

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
      return PALIN_AFFILIATED_MERCHANTS;
    }

    if (!data || data.length === 0) {
      return PALIN_AFFILIATED_MERCHANTS;
    }

    return data.map((item) => ({
      ...item,
      tipo_promocion: item.tipo_promocion || 'Descuento (Q)',
    }));
  } catch (err) {
    console.warn('[financial.js] Fallback a comercios locales de Palín:', err.message);
    return PALIN_AFFILIATED_MERCHANTS;
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

    // 2. Actualizar inmediatamente el estado de suscripción del ciudadano en `perfiles`
    try {
      await supabase
        .from('perfiles')
        .update({
          estado_suscripcion: 'activa',
          activo: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', clientId);
    } catch (profileErr) {
      console.warn('[financial.js] Advertencia actualizando perfiles.estado_suscripcion:', profileErr);
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

