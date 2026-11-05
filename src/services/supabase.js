import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

/**
 * Adaptador de almacenamiento persistente híbrido (Web y Móvil).
 * En Web utiliza localStorage del navegador para evitar el colapso de SecureStore.
 * En Móvil (iOS y Android) utiliza Expo SecureStore cifrado.
 */
const StorageAdapter = {
  getItem: async (key) => {
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(key);
        }
        return null;
      } catch (error) {
        console.error(`[LocalStorage] Error leyendo key "${key}":`, error);
        return null;
      }
    }

    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error(`[SecureStore] Error leyendo key "${key}":`, error);
      return null;
    }
  },
  setItem: async (key, value) => {
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, value);
        }
      } catch (error) {
        console.error(`[LocalStorage] Error guardando key "${key}":`, error);
      }
      return;
    }

    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.error(`[SecureStore] Error guardando key "${key}":`, error);
    }
  },
  removeItem: async (key) => {
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
        }
      } catch (error) {
        console.error(`[LocalStorage] Error eliminando key "${key}":`, error);
      }
      return;
    }

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
    storage: StorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
