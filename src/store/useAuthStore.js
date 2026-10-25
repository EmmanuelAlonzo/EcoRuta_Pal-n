import { create } from 'zustand';
import { supabase } from '../services/supabase';
import { loginWithEmail, registerWithEmail, fetchUserProfile, signOutUser } from '../api/auth';

/**
 * Store global de autenticación, perfil y sesión con Zustand.
 * Maneja el flujo real de Supabase Auth, persistencia de sesión,
 * estados de carga y errores.
 */
export const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  session: null,
  role: null,
  isAuthenticated: false,
  isLoading: true, // Inicia en true mientras se verifica la sesión
  error: null,
  isConnected: true,

  /**
   * 1. Inicio de sesión real con Supabase
   */
  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { session, user, profile } = await loginWithEmail(email, password);
      
      set({
        session,
        user,
        profile,
        role: profile.rol,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      return { success: true };
    } catch (err) {
      console.error('[useAuthStore] Error en login:', err);
      const errorMessage = err.message || 'Ocurrió un error inesperado al iniciar sesión.';
      set({
        error: errorMessage,
        isLoading: false,
        isAuthenticated: false,
      });
      return { success: false, error: errorMessage };
    }
  },

  /**
   * 2. Registro de nuevo usuario (cliente) con Supabase Auth
   */
  register: async (email, password, nombreCompleto) => {
    set({ isLoading: true, error: null });
    try {
      const data = await registerWithEmail(email, password, nombreCompleto);

      // Si Supabase devuelve sesión inmediatamente (sin requerir confirmación por correo)
      if (data?.session && data?.user) {
        try {
          const profile = await fetchUserProfile(data.user.id);
          set({
            session: data.session,
            user: data.user,
            profile,
            role: profile?.rol || 'cliente',
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch {
          // Si el trigger de la base de datos aún no ha insertado el perfil en el mismo tick
          set({
            session: data.session,
            user: data.user,
            profile: { id: data.user.id, email: data.user.email, nombre_completo: nombreCompleto, rol: 'cliente' },
            role: 'cliente',
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        }
        return { success: true, session: data.session, user: data.user };
      }

      set({ isLoading: false, error: null });
      return { success: true, session: null, user: data?.user };
    } catch (err) {
      console.error('[useAuthStore] Error en register:', err);
      const errorMessage = err.message || 'Ocurrió un error al registrar la cuenta.';
      set({
        error: errorMessage,
        isLoading: false,
      });
      return { success: false, error: errorMessage };
    }
  },

  /**
   * 3. Recuperación automática de sesión persistente (App startup)
   */
  initializeAuth: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.warn('[useAuthStore] Error obteniendo sesión guardada:', sessionError.message);
        set({ session: null, user: null, profile: null, role: null, isAuthenticated: false, isLoading: false });
        return;
      }

      if (session?.user) {
        // Recuperar perfil actualizado desde la tabla `perfiles`
        try {
          const profile = await fetchUserProfile(session.user.id);
          set({
            session,
            user: session.user,
            profile,
            role: profile.rol,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (profileErr) {
          console.error('[useAuthStore] Sesión activa pero fallo al obtener perfil:', profileErr);
          set({
            session,
            user: session.user,
            profile: null,
            role: null,
            isAuthenticated: false,
            isLoading: false,
            error: 'No se pudo cargar la información del perfil asociado a tu cuenta.',
          });
        }
      } else {
        // No hay sesión activa previa
        set({
          session: null,
          user: null,
          profile: null,
          role: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    } catch (err) {
      console.error('[useAuthStore] Error en initializeAuth:', err);
      set({
        session: null,
        user: null,
        profile: null,
        role: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  /**
   * 4. Cerrar sesión
   */
  logout: async () => {
    set({ isLoading: true });
    try {
      await signOutUser();
    } catch (err) {
      console.warn('[useAuthStore] Advertencia al cerrar sesión en Supabase:', err);
    } finally {
      set({
        user: null,
        profile: null,
        session: null,
        role: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }
  },

  /**
   * Limpiar mensaje de error en la UI
   */
  clearError: () => set({ error: null }),

  setNetworkStatus: (isConnected) => set({ isConnected }),
}));
