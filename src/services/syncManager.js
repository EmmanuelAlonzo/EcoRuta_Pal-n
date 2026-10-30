import NetInfo from '@react-native-community/netinfo';
import {
  obtenerPendientesDeSincronizar,
  marcarComoSincronizado,
} from './sqlite/database';
import { uploadCollectionRecord } from '../api/collections';
import { useAuthStore } from '../store/useAuthStore';

// Bandera de control para evitar ejecuciones concurrentes de sincronización
let isSyncing = false;

/**
 * Ejecuta la sincronización de todas las recolecciones pendientes en segundo plano.
 * REGLA ESTRICTA: Opera de forma totalmente silenciosa, sin Alert.alert ni bloqueos de UI.
 * 
 * @returns {Promise<{ total: number, synced: number, failed: number }>}
 */
export const ejecutarSincronizacionSilenciosa = async () => {
  if (isSyncing) {
    console.log('⏳ [SilentSync] Proceso de sincronización ya en curso. Omitiendo llamada duplicada.');
    return { total: 0, synced: 0, failed: 0 };
  }

  isSyncing = true;
  try {
    const pendientes = await obtenerPendientesDeSincronizar();

    if (!pendientes || pendientes.length === 0) {
      console.log('🌿 [SilentSync] Base local verificada: No hay recolecciones pendientes en SQLite.');
      return { total: 0, synced: 0, failed: 0 };
    }

    console.log(`📡 [SilentSync] Iniciando subida silenciosa de ${pendientes.length} recolección(es) a Supabase...`);

    let synced = 0;
    let failed = 0;

    for (const record of pendientes) {
      try {
        await uploadCollectionRecord(record);
        await marcarComoSincronizado(record.id);
        synced++;
        console.log(`✅ [SilentSync] Recolección "${record.id}" (Cliente: ${record.cliente_id}) sincronizada con éxito en Supabase.`);
      } catch (err) {
        failed++;
        console.log(`⚠️ [SilentSync] Falló la subida de la recolección "${record.id}": ${err.message}`);
      }
    }

    console.log(`🎉 [SilentSync] Sincronización en segundo plano finalizada: ${synced} sincronizadas, ${failed} pendientes de ${pendientes.length} totales.`);
    return { total: pendientes.length, synced, failed };
  } catch (error) {
    console.log('❌ [SilentSync] Error general en sincronización en segundo plano:', error.message);
    return { total: 0, synced: 0, failed: 0 };
  } finally {
    isSyncing = false;
  }
};

/**
 * Inicia el escucha silencioso en segundo plano ante cambios de red.
 * Se suscribe a NetInfo.addEventListener y, al detectar conexión activa,
 * procesa automáticamente la cola offline de SQLite hacia Supabase.
 * 
 * @returns {Function} Función para cancelar la suscripción (unsubscribe)
 */
export const startSilentSyncListener = () => {
  console.log('🔄 [SilentSync] Activando listener de red para sincronización silenciosa (Operario)...');

  // 1. Verificación inicial al montar
  NetInfo.fetch()
    .then((state) => {
      const isOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
      console.log(`🌐 [SilentSync] Estado de red inicial: conectado=${state.isConnected}, internetReachable=${state.isInternetReachable}`);

      if (useAuthStore.getState().setNetworkStatus) {
        useAuthStore.getState().setNetworkStatus(isOnline);
      }

      if (isOnline) {
        ejecutarSincronizacionSilenciosa();
      }
    })
    .catch((err) => {
      console.log('⚠️ [SilentSync] Error al verificar estado inicial de red:', err.message);
    });

  // 2. Suscripción reactiva a cambios de conectividad
  const unsubscribe = NetInfo.addEventListener((state) => {
    const isOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
    console.log(`🌐 [SilentSync] Evento de red: conectado=${state.isConnected}, internetReachable=${state.isInternetReachable}`);

    if (useAuthStore.getState().setNetworkStatus) {
      useAuthStore.getState().setNetworkStatus(isOnline);
    }

    if (isOnline) {
      ejecutarSincronizacionSilenciosa();
    }
  });

  return unsubscribe;
};

/**
 * Sincronización manual bajo demanda (usada por la interfaz de usuario en OperatorHomeScreen)
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
