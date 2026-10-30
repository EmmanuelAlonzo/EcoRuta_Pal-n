import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

/**
 * Gestor de Base de Datos Local con Expo SQLite (API moderna SDK 51+)
 * Implementa el almacenamiento local offline-first para las recolecciones de residuos.
 */
let dbInstance = null;

// Fallback en memoria si se ejecuta en entorno Web sin soporte SQLite nativo
const memoryStore = {
  records: [],
};

/**
 * Obtiene la instancia abierta de SQLite
 */
export const getDatabase = async () => {
  if (Platform.OS === 'web') return null;
  if (dbInstance) return dbInstance;
  try {
    dbInstance = await SQLite.openDatabaseAsync('ecoruta.db');
    return dbInstance;
  } catch (error) {
    console.error('[SQLite] Error abriendo la base de datos local:', error);
    return null;
  }
};

/**
 * Inicializa la tabla `recolecciones_locales` en SQLite
 */
export const initDatabase = async () => {
  if (Platform.OS === 'web') {
    console.log('[SQLite] Entorno Web detectado: utilizando almacenamiento en memoria para pruebas.');
    return;
  }

  const db = await getDatabase();
  if (!db) return;

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS recolecciones_locales (
      id TEXT PRIMARY KEY NOT NULL,
      cliente_id TEXT NOT NULL,
      operario_id TEXT NOT NULL,
      operario_nombre TEXT,
      codigo_camion TEXT,
      ruta_asignada TEXT,
      tipo_material TEXT NOT NULL,
      material_nombre TEXT,
      peso_kg REAL DEFAULT 0,
      puntos_otorgados INTEGER DEFAULT 0,
      latitud REAL,
      longitud REAL,
      precision_gps REAL,
      fecha_recoleccion TEXT NOT NULL,
      separado INTEGER DEFAULT 0,
      sincronizado INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await db.execAsync(createTableQuery);
    try {
      await db.execAsync('ALTER TABLE recolecciones_locales ADD COLUMN ruta_asignada TEXT;');
    } catch {
      // Columna ya existente
    }
    console.log('✅ [SQLite] Tabla `recolecciones_locales` lista y verificada.');
  } catch (error) {
    console.error('[SQLite] Error al inicializar tabla:', error);
    throw error;
  }
};

/**
 * Inserta un registro de recolección en SQLite con estado `sincronizado = 0`
 * @param {object} record
 */
export const insertarRecoleccion = async (record) => {
  if (Platform.OS === 'web') {
    memoryStore.records.push({ ...record, sincronizado: 0 });
    console.log('💾 [SQLite Web Mock] Recolección guardada en memoria:', record.id);
    return record.id;
  }

  const db = await getDatabase();
  if (!db) throw new Error('No se pudo abrir la base de datos local.');

  const insertQuery = `
    INSERT INTO recolecciones_locales (
      id, cliente_id, operario_id, operario_nombre, codigo_camion, ruta_asignada,
      tipo_material, material_nombre, peso_kg, puntos_otorgados,
      latitud, longitud, precision_gps, fecha_recoleccion,
      separado, sincronizado
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0);
  `;

  const values = [
    record.id,
    record.cliente_id,
    record.operario_id,
    record.operario_nombre || null,
    record.codigo_camion || null,
    record.ruta_asignada || null,
    record.tipo_material,
    record.material_nombre || null,
    record.peso_kg ?? 0,
    record.puntos_otorgados ?? 0,
    record.latitud || null,
    record.longitud || null,
    record.precision_gps || null,
    record.fecha_recoleccion,
    record.separado ?? 0,
  ];

  try {
    await db.runAsync(insertQuery, values);
    console.log('💾 [SQLite] Recolección insertada exitosamente en local:', record.id);
    return record.id;
  } catch (error) {
    console.error('[SQLite] Error al insertar recolección local:', error);
    throw error;
  }
};

/**
 * Obtiene todas las recolecciones pendientes de sincronizar (sincronizado === 0)
 * @returns {Promise<Array>}
 */
export const obtenerPendientesDeSincronizar = async () => {
  if (Platform.OS === 'web') {
    return memoryStore.records.filter((r) => r.sincronizado === 0);
  }

  const db = await getDatabase();
  if (!db) return [];

  const selectQuery = `
    SELECT * FROM recolecciones_locales
    WHERE sincronizado = 0
    ORDER BY fecha_recoleccion ASC;
  `;

  try {
    const rows = await db.getAllAsync(selectQuery);
    return rows || [];
  } catch (error) {
    console.error('[SQLite] Error consultando pendientes de sincronizar:', error);
    return [];
  }
};

/**
 * Actualiza el estado de un registro local a sincronizado = 1 (true)
 * @param {string} id
 */
export const marcarComoSincronizado = async (id) => {
  if (Platform.OS === 'web') {
    const item = memoryStore.records.find((r) => r.id === id);
    if (item) item.sincronizado = 1;
    return;
  }

  const db = await getDatabase();
  if (!db) return;

  const updateQuery = `
    UPDATE recolecciones_locales
    SET sincronizado = 1
    WHERE id = ?;
  `;

  try {
    await db.runAsync(updateQuery, [id]);
    console.log(`☁️ [SQLite] Registro local "${id}" marcado como sincronizado.`);
  } catch (error) {
    console.error(`[SQLite] Error al marcar como sincronizado "${id}":`, error);
    throw error;
  }
};

/**
 * Cuenta cuántos registros locales no han sido subidos a la nube
 * @returns {Promise<number>}
 */
export const obtenerConteoPendientes = async () => {
  if (Platform.OS === 'web') {
    return memoryStore.records.filter((r) => r.sincronizado === 0).length;
  }

  const db = await getDatabase();
  if (!db) return 0;

  try {
    const result = await db.getFirstAsync(
      'SELECT COUNT(*) as count FROM recolecciones_locales WHERE sincronizado = 0;'
    );
    return result?.count || 0;
  } catch (error) {
    console.error('[SQLite] Error al contar pendientes:', error);
    return 0;
  }
};

/**
 * Consulta la recolección más reciente de un cliente registrada localmente en SQLite
 * @param {string} clienteId
 * @returns {Promise<object|null>}
 */
export const obtenerUltimaRecoleccionLocal = async (clienteId) => {
  if (Platform.OS === 'web') {
    const records = memoryStore.records
      .filter((r) => r.cliente_id === clienteId)
      .sort((a, b) => new Date(b.fecha_recoleccion) - new Date(a.fecha_recoleccion));
    return records[0] || null;
  }

  const db = await getDatabase();
  if (!db) return null;

  try {
    const query = `
      SELECT fecha_recoleccion FROM recolecciones_locales
      WHERE cliente_id = ?
      ORDER BY fecha_recoleccion DESC
      LIMIT 1;
    `;
    const record = await db.getFirstAsync(query, [clienteId]);
    return record || null;
  } catch (error) {
    console.warn('[SQLite] Error al consultar última recolección local:', error);
    return null;
  }
};

