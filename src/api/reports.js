import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { supabase } from '../services/supabase';

/**
 * Función auxiliar para escapar celdas en formato CSV estándar RFC 4180
 * @param {any} value
 * @returns {string}
 */
const escapeCSV = (value) => {
  if (value === null || value === undefined) return '""';
  const stringValue = String(value).trim();
  // Si contiene comas, comillas dobles o saltos de línea, se envuelve entre comillas y se duplican las comillas internas
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return `"${stringValue}"`;
};

/**
 * Formatea una fecha ISO a formato local legible de Guatemala
 * @param {string} isoString
 * @returns {string}
 */
const formatDate = (isoString) => {
  if (!isoString) return 'N/A';
  try {
    const d = new Date(isoString);
    return d.toLocaleString('es-GT', {
      timeZone: 'America/Guatemala',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoString;
  }
};

/**
 * Genera y exporta el Reporte Gerencial de EcoRuta Palín en formato CSV.
 * Cruza en tiempo real `historial_recolecciones`, `historial_canjes`, `perfiles` y `catalogo_incentivos`.
 * Guarda el archivo temporalmente y abre la hoja de compartir nativa.
 * 
 * @returns {Promise<{ success: boolean, fileUri: string, totalRecolecciones: number, totalCanjes: number }>}
 */
export const generateAdminReportCSV = async () => {
  console.log('📊 [reports.js] Iniciando generación de reporte administrativo...');

  // 1. Validar disponibilidad de compartir en el dispositivo
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('La función nativa para compartir archivos no está disponible en este dispositivo.');
  }

  // 2. Consultas en paralelo a Supabase
  const [recoleccionesRes, canjesRes, perfilesRes, incentivosRes] = await Promise.all([
    supabase
      .from('historial_recolecciones')
      .select('*')
      .order('fecha_recoleccion', { ascending: false }),
    supabase
      .from('historial_canjes')
      .select('*')
      .order('fecha_canje', { ascending: false }),
    supabase
      .from('perfiles')
      .select('id, nombre_completo, email, rol, direccion, codigo_camion, ruta_asignada, telefono'),
    supabase
      .from('catalogo_incentivos')
      .select('id, nombre, comercio, costo_puntos'),
  ]);

  if (recoleccionesRes.error) {
    console.error('[reports.js] Error consultando historial_recolecciones:', recoleccionesRes.error);
    throw new Error(`Error en recolecciones: ${recoleccionesRes.error.message}`);
  }

  if (canjesRes.error) {
    console.error('[reports.js] Error consultando historial_canjes:', canjesRes.error);
    throw new Error(`Error en canjes: ${canjesRes.error.message}`);
  }

  const recolecciones = recoleccionesRes.data || [];
  const canjes = canjesRes.data || [];
  const perfiles = perfilesRes.data || [];
  const incentivos = incentivosRes.data || [];

  // Mapear perfiles e incentivos por ID para acceso O(1)
  const profileMap = new Map();
  perfiles.forEach((p) => profileMap.set(p.id, p));

  const incentiveMap = new Map();
  incentivos.forEach((inc) => incentiveMap.set(inc.id, inc));

  // 3. Estructuración del Contenido CSV
  const csvLines = [];

  // Byte Order Mark (BOM) UTF-8 para garantizar acentos correctos en Microsoft Excel
  const UTF8_BOM = '\uFEFF';

  // Encabezado institucional
  csvLines.push(UTF8_BOM + [
    escapeCSV('MUNICIPALIDAD DE PALÍN, ESCUINTLA'),
    escapeCSV('DIRECCIÓN DE GESTIÓN AMBIENTAL Y SERVICIOS PÚBLICOS'),
    escapeCSV('SISTEMA ECORUTA PALÍN - REPORTE GERENCIAL'),
  ].join(','));

  const nowFormatted = formatDate(new Date().toISOString());
  csvLines.push([escapeCSV('Fecha de Emisión:'), escapeCSV(nowFormatted)].join(','));
  csvLines.push([escapeCSV('Total Recolecciones Registradas:'), escapeCSV(recolecciones.length)].join(','));
  
  const totalKg = recolecciones.reduce((acc, curr) => acc + (parseFloat(curr.peso_kg) || 0), 0);
  csvLines.push([escapeCSV('Total Kilogramos Reciclados:'), escapeCSV(totalKg.toFixed(2))].join(','));
  csvLines.push([escapeCSV('Total Canjes de Incentivos:'), escapeCSV(canjes.length)].join(','));
  csvLines.push(''); // Línea en blanco

  // ── SECCIÓN 1: REPORTE DETALLADO DE RECOLECCIONES EN RUTA ─────────────────
  csvLines.push([escapeCSV('=== SECCIÓN 1: HISTORIAL DE RECOLECCIONES DE RESIDUOS ===')].join(','));
  csvLines.push([
    escapeCSV('ID Recolección'),
    escapeCSV('Fecha y Hora'),
    escapeCSV('Nombre Cliente'),
    escapeCSV('Correo Cliente'),
    escapeCSV('Dirección / Sector'),
    escapeCSV('Operario Responsable'),
    escapeCSV('Código Camión'),
    escapeCSV('Ruta Asignada'),
    escapeCSV('Tipo de Residuo'),
    escapeCSV('Peso (kg)'),
    escapeCSV('Latitud GPS'),
    escapeCSV('Longitud GPS'),
  ].join(','));

  recolecciones.forEach((rec) => {
    const cliente = profileMap.get(rec.cliente_id) || {};
    const operario = profileMap.get(rec.operario_id) || {};

    csvLines.push([
      escapeCSV(rec.id),
      escapeCSV(formatDate(rec.fecha_recoleccion)),
      escapeCSV(cliente.nombre_completo || 'Vecino de Palín'),
      escapeCSV(cliente.email || 'N/A'),
      escapeCSV(cliente.direccion || 'Palín, Escuintla'),
      escapeCSV(operario.nombre_completo || 'Operario de Ruta'),
      escapeCSV(operario.codigo_camion || 'CAM-01'),
      escapeCSV(operario.ruta_asignada || 'Zona 1'),
      escapeCSV(rec.tipo_material || 'Residuos Separados'),
      escapeCSV(rec.peso_kg !== null && rec.peso_kg !== undefined ? parseFloat(rec.peso_kg).toFixed(2) : '0.00'),
      escapeCSV(rec.latitud || 'N/A'),
      escapeCSV(rec.longitud || 'N/A'),
    ].join(','));
  });

  csvLines.push(''); // Línea en blanco separadora
  csvLines.push('');

  // ── SECCIÓN 2: REPORTE DE CANJES DE INCENTIVOS Y BENEFICIOS ───────────────
  csvLines.push([escapeCSV('=== SECCIÓN 2: HISTORIAL DE CANJES DE INCENTIVOS ===')].join(','));
  csvLines.push([
    escapeCSV('ID Canje'),
    escapeCSV('Fecha y Hora'),
    escapeCSV('Nombre Ciudadano'),
    escapeCSV('Correo Ciudadano'),
    escapeCSV('Incentivo Canjeado'),
    escapeCSV('Comercio Aliado'),
    escapeCSV('Puntos Descontados'),
    escapeCSV('Estado de Entrega'),
  ].join(','));

  canjes.forEach((c) => {
    const cliente = profileMap.get(c.cliente_id) || {};
    const incentivo = incentiveMap.get(c.incentivo_id) || {};

    csvLines.push([
      escapeCSV(c.id),
      escapeCSV(formatDate(c.fecha_canje)),
      escapeCSV(cliente.nombre_completo || 'Ciudadano'),
      escapeCSV(cliente.email || 'N/A'),
      escapeCSV(incentivo.nombre || 'Premio Ecológico'),
      escapeCSV(incentivo.comercio || 'Municipalidad de Palín'),
      escapeCSV(c.puntos_descontados || 0),
      escapeCSV(c.estado ? c.estado.toUpperCase() : 'PENDIENTE'),
    ].join(','));
  });

  const csvString = csvLines.join('\r\n');

  // 4. Guardar archivo temporal en el sistema de archivos del dispositivo
  const dateStamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `EcoRuta_Palin_Reporte_${dateStamp}.csv`;
  const fileUri = `${FileSystem.documentDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(fileUri, csvString, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  console.log(`📁 [reports.js] Reporte CSV guardado exitosamente en: ${fileUri}`);

  // 5. Abrir la hoja de compartir nativa (WhatsApp, Correo, Drive, etc.)
  await Sharing.shareAsync(fileUri, {
    mimeType: 'text/csv',
    dialogTitle: 'Exportar Reporte Oficial - EcoRuta Palín',
    UTI: 'public.comma-separated-values-text',
  });

  return {
    success: true,
    fileUri,
    totalRecolecciones: recolecciones.length,
    totalCanjes: canjes.length,
  };
};
