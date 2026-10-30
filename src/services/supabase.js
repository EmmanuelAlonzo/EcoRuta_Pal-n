import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

/**
 * Adaptador de almacenamiento persistente usando Expo SecureStore.
 * Garantiza que tokens JWT y sesiones de Supabase se guarden
 * de forma cifrada en el llavero/almacén seguro del dispositivo móvil.
 */
const ExpoSecureStoreAdapter = {
  getItem: async (key) => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error(`[SecureStore] Error leyendo key "${key}":`, error);
      return null;
    }
  },
  setItem: async (key, value) => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.error(`[SecureStore] Error guardando key "${key}":`, error);
    }
  },
  removeItem: async (key) => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error(`[SecureStore] Error eliminando key "${key}":`, error);
    }
  },
};

// Credenciales inyectadas directamente para evitar errores de lectura del .env
const supabaseUrl = 'https://twpburcjswimkwedgiuv.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3cGJ1cmNqc3dpbWt3ZWRnaXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NTc3MTcsImV4cCI6MjEwODAzMzcxN30.otrHJobBGKsg1b_jm0TATB9WXjwkg8rxpJb_m1oRpnQ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});