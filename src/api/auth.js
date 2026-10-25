import { supabase } from '../services/supabase';

/**
 * Iniciar sesión con email y contraseña en Supabase Auth
 * y obtener inmediatamente los datos del perfil desde la tabla `perfiles`.
 * 
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ session: object, user: object, profile: object }>}
 */
export const loginWithEmail = async (email, password) => {
  const trimmedEmail = email.trim();

  // 1. Autenticar credenciales contra Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: trimmedEmail,
    password,
  });

  if (authError) {
    // Errores comunes: Invalid login credentials, Email not confirmed, etc.
    if (authError.message.includes('Invalid login credentials')) {
      throw new Error('Credenciales inválidas. Verifica tu correo y contraseña.');
    }
    if (authError.message.includes('Email not confirmed')) {
      throw new Error('Tu correo electrónico aún no ha sido confirmado.');
    }
    throw new Error(authError.message || 'Error al autenticar el usuario.');
  }

  const user = authData?.user;
  if (!user) {
    throw new Error('No se recibió la sesión del usuario.');
  }

  // 2. Consultar la tabla `perfiles` filtrando por el ID del usuario
  const { data: profile, error: profileError } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profileError) {
    console.error('[auth.js] Error al consultar la tabla perfiles:', profileError);
    throw new Error(
      `Autenticación exitosa, pero ocurrió un problema al cargar tu perfil: ${profileError.message}`
    );
  }

  if (!profile || !profile.rol) {
    throw new Error('El usuario no tiene un rol asignado en la tabla perfiles.');
  }

  return {
    session: authData.session,
    user,
    profile,
  };
};

/**
 * Registrar nuevo usuario (cliente) en Supabase Auth.
 * Empaqueta nombre_completo y rol en raw_user_meta_data para el trigger de `perfiles`.
 * 
 * @param {string} email
 * @param {string} password
 * @param {string} nombreCompleto
 * @returns {Promise<{ data: object, error: object }>}
 */
export const registerWithEmail = async (email, password, nombreCompleto) => {
  const trimmedEmail = email.trim();
  const trimmedNombre = nombreCompleto.trim();

  const { data, error } = await supabase.auth.signUp({
    email: trimmedEmail,
    password,
    options: {
      data: {
        nombre_completo: trimmedNombre,
        rol: 'cliente',
      },
    },
  });

  if (error) {
    console.error('[auth.js] Error al registrar usuario:', error);
    throw error;
  }

  return data;
};

/**
 * Obtener perfil de la tabla `perfiles` dado un user.id (usado en recuperación de sesión)
 * @param {string} userId
 * @returns {Promise<object>}
 */
export const fetchUserProfile = async (userId) => {
  const { data: profile, error } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[auth.js] Error al recuperar perfil por ID:', error);
    throw error;
  }

  return profile;
};

/**
 * Cerrar sesión en Supabase y purgar tokens de SecureStore
 */
export const signOutUser = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('[auth.js] Error al cerrar sesión:', error);
    throw new Error(error.message || 'Error al cerrar sesión.');
  }
};
