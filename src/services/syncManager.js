import {
  obtenerPendientesDeSincronizar,
  marcarComoSincronizado,
} from './sqlite/database';
import { uploadCollectionRecord } from '../api/collections';

/**
 * Gestor de Sincronización Offline-First
 * Lee la cola local en SQLite y sube cada recolección a Supabase.
 * Si la subida es exitosa, actualiza la marca local a `sincronizado = 1`.
 * 
 * @returns {Promise<{ total: number, synced: number, failed: number, message: string }>}
 */
export const sincronizarPendientes = async () => {
  try {
    const pendientes = await obtenerPendientesDeSincronizar();

    if (!pendientes || pendientes.length === 0) {
      return {
        total: 0,
        synced: 0,
        failed: 0,
        message: 'No hay recolecciones pendientes por sincronizar.',
      };
    }

    let synced = 0;
    let failed = 0;
    const errors = [];

    for (const record of pendientes) {
      try {
        await uploadCollectionRecord(record);
        await marcarComoSincronizado(record.id);
        synced++;
      } catch (err) {
        console.warn(`[syncManager] Error al sincronizar registro "${record.id}":`, err.message);
        failed++;
        errors.push({ id: record.id, error: err.message });
      }
    }

    return {
      total: pendientes.length,
      synced,
      failed,
      errors,
      message: `${synced} de ${pendientes.length} recolecciones sincronizadas exitosamente.`,
    };
  } catch (error) {
    console.error('[syncManager] Error general en el proceso de sincronización:', error);
    throw new Error(
      error.message || 'No se pudo completar la sincronización. Verifica tu conexión a internet.'
    );
  }
};
