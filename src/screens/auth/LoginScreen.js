import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/useAuthStore';
import { supabase } from '../../services/supabase';
import { THEME } from '../../constants/theme';

export default function LoginScreen() {
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Acciones y estados globales
  const login = useAuthStore((state) => state.login);
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const storeLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);

  const isLoading = storeLoading || isSubmitting;

  const toggleMode = (register) => {
    clearError();
    setIsRegisterMode(register);
  };

  /**
   * Manejador de Inicio de Sesión
   */
  const handleLogin = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      Alert.alert('Campos requeridos', 'Por favor ingresa tu correo y contraseña.');
      return;
    }

    clearError();
    await login(trimmedEmail, password);
  };

  /**
   * Manejador de Registro de Nuevo Usuario
   */
  const handleSignUp = async () => {
    const trimmedNombre = nombreCompleto.trim();
    const trimmedEmail = email.trim();

    if (!trimmedNombre) {
      Alert.alert('Nombre requerido', 'Por favor ingresa tu nombre completo.');
      return;
    }

    if (!trimmedEmail) {
      Alert.alert('Correo requerido', 'Por favor ingresa tu correo electrónico.');
      return;
    }

    if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      Alert.alert('Correo inválido', 'Por favor ingresa un formato de correo electrónico válido.');
      return;
    }

    if (!password) {
      Alert.alert('Contraseña requerida', 'Por favor ingresa una contraseña.');
      return;
    }

    if (password.length < 6) {
      Alert.alert(
        'Contraseña débil',
        'La contraseña debe tener al menos 6 caracteres por seguridad.'
      );
      return;
    }

    clearError();
    setIsSubmitting(true);

    try {
      // Invocación a supabase.auth.signUp pasando nombre_completo y rol en metadata
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: password,
        options: {
          data: {
            nombre_completo: trimmedNombre,
            rol: 'cliente',
          },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      if (data?.session) {
        // Sesión iniciada inmediatamente
        Alert.alert(
          '¡Cuenta creada!',
          `Bienvenido a EcoRuta Palín, ${trimmedNombre}. Tu cuenta ha sido activada con éxito.`,
          [{ text: 'Continuar' }]
        );
        await initializeAuth();
      } else {
        // En caso de que se requiera confirmación de email o inicio de sesión manual
        Alert.alert(
          '¡Registro exitoso!',
          'Tu cuenta de ciudadano ha sido creada correctamente en EcoRuta Palín. Ya puedes iniciar sesión con tus credenciales.',
          [
            {
              text: 'Iniciar sesión ahora',
              onPress: () => {
                setIsRegisterMode(false);
                setPassword('');
              },
            },
          ]
        );
        setIsRegisterMode(false);
        setPassword('');
      }
    } catch (err) {
      console.error('[LoginScreen] Error en registro:', err);
      let errorMsg = err.message || 'No se pudo crear la cuenta. Inténtalo de nuevo.';
      if (errorMsg.includes('User already registered')) {
        errorMsg = 'Este correo electrónico ya se encuentra registrado. Intenta iniciar sesión.';
      }
      Alert.alert('Error al crear cuenta', errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={THEME.colors.background} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          {/* Encabezado y Marca */}
          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoIcon}>🌿</Text>
            </View>
            <Text style={styles.title}>EcoRuta Palín</Text>
            <Text style={styles.subtitle}>
              Sistema de Recolección de Desechos e Incentivos de Reciclaje
            </Text>
            <View style={styles.tagBadge}>
              <Text style={styles.tagText}>📍 Palín, Escuintla</Text>
            </View>
          </View>

          {/* Formulario Principal */}
          <View style={styles.card}>
            {/* Toggle Alternable: Iniciar Sesión / Crear Cuenta */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tabButton, !isRegisterMode && styles.tabButtonActive]}
                onPress={() => toggleMode(false)}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, !isRegisterMode && styles.tabTextActive]}>
                  Iniciar Sesión
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabButton, isRegisterMode && styles.tabButtonActive]}
                onPress={() => toggleMode(true)}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, isRegisterMode && styles.tabTextActive]}>
                  Crear Cuenta
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.cardTitle}>
              {isRegisterMode ? 'Registro de Ciudadano' : 'Bienvenido de nuevo'}
            </Text>
            <Text style={styles.cardDesc}>
              {isRegisterMode
                ? 'Crea tu cuenta para acumular puntos por reciclar y canjear premios.'
                : 'Ingresa con tu correo y contraseña registrados en el sistema.'}
            </Text>

            {/* Banner de Error si la autenticación falla */}
            {error && !isRegisterMode ? (
              <View style={styles.errorBanner}>
                <View style={styles.errorIconContainer}>
                  <Text style={styles.errorIcon}>⚠️</Text>
                </View>
                <View style={styles.errorTextContainer}>
                  <Text style={styles.errorTitle}>Error de autenticación</Text>
                  <Text style={styles.errorMessage}>{error}</Text>
                </View>
                <TouchableOpacity onPress={clearError} style={styles.closeErrorBtn}>
                  <Text style={styles.closeErrorText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Campo adicional de Nombre Completo solo en Registro */}
            {isRegisterMode && (
              <View>
                <Text style={styles.inputLabel}>Nombre completo *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej. María González"
                  placeholderTextColor={THEME.colors.textSecondary}
                  value={nombreCompleto}
                  onChangeText={setNombreCompleto}
                  autoCapitalize="words"
                  autoCorrect={false}
                  editable={!isLoading}
                />
              </View>
            )}

            {/* Campo: Correo Electrónico */}
            <Text style={styles.inputLabel}>Correo electrónico *</Text>
            <TextInput
              style={styles.input}
              placeholder="correo@ejemplo.com"
              placeholderTextColor={THEME.colors.textSecondary}
              value={email}
              onChangeText={(text) => {
                if (error) clearError();
                setEmail(text);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!isLoading}
            />

            {/* Campo: Contraseña */}
            <View style={styles.passwordLabelRow}>
              <Text style={styles.inputLabel}>Contraseña *</Text>
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Text style={styles.showPasswordText}>
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              placeholder={isRegisterMode ? 'Mínimo 6 caracteres' : 'Tu contraseña'}
              placeholderTextColor={THEME.colors.textSecondary}
              value={password}
              onChangeText={(text) => {
                if (error) clearError();
                setPassword(text);
              }}
              secureTextEntry={!showPassword}
              editable={!isLoading}
            />

            {/* Botón de Acción Principal */}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                isLoading && styles.primaryButtonDisabled,
              ]}
              onPress={isRegisterMode ? handleSignUp : handleLogin}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <View style={styles.buttonLoadingRow}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>
                    {isRegisterMode ? ' Creando cuenta...' : ' Verificando credenciales...'}
                  </Text>
                </View>
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isRegisterMode ? 'Registrarme en EcoRuta' : 'Ingresar al Sistema'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Selector rápido al pie de la tarjeta para alternar entre Login y Registro */}
            <View style={styles.toggleFooter}>
              <Text style={styles.toggleFooterText}>
                {isRegisterMode
                  ? '¿Ya tienes una cuenta registrada?'
                  : '¿Aún no tienes cuenta en EcoRuta?'}
              </Text>
              <TouchableOpacity
                onPress={() => toggleMode(!isRegisterMode)}
                style={styles.toggleFooterAction}
              >
                <Text style={styles.toggleFooterActionText}>
                  {isRegisterMode ? 'Inicia sesión aquí' : 'Regístrate aquí'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Pie de página institucional */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Municipalidad de Palín • Gestión Ambiental
            </Text>
            <Text style={styles.footerSubText}>
              EcoRuta Palín — Conectando comunidad y reciclaje
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  container: {
    padding: 20,
    justifyContent: 'center',
    minHeight: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logoBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: THEME.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  logoIcon: {
    fontSize: 30,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20,
    lineHeight: 18,
  },
  tagBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
  tagText: {
    fontSize: 12,
    color: '#0369A1',
    fontWeight: '600',
  },
  card: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
  },
  tabTextActive: {
    color: THEME.colors.primary,
    fontWeight: '700',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  cardDesc: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginBottom: 14,
    marginTop: 2,
  },
  errorBanner: {
    flexDirection: 'row',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#F87171',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    alignItems: 'flex-start',
  },
  errorIconContainer: {
    marginRight: 8,
    marginTop: 2,
  },
  errorIcon: {
    fontSize: 14,
  },
  errorTextContainer: {
    flex: 1,
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#991B1B',
  },
  errorMessage: {
    fontSize: 12,
    color: '#B91C1C',
    marginTop: 2,
    lineHeight: 16,
  },
  closeErrorBtn: {
    padding: 4,
    marginLeft: 4,
  },
  closeErrorText: {
    color: '#991B1B',
    fontWeight: '700',
    fontSize: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
    marginBottom: 6,
    marginTop: 10,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  showPasswordText: {
    fontSize: 12,
    color: THEME.colors.primaryDark,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: THEME.colors.textPrimary,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  primaryButton: {
    backgroundColor: THEME.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    shadowColor: THEME.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  buttonLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  toggleFooter: {
    marginTop: 16,
    alignItems: 'center',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
  },
  toggleFooterText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginBottom: 4,
  },
  toggleFooterAction: {
    paddingVertical: 4,
  },
  toggleFooterActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
    textAlign: 'center',
  },
  footerSubText: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
    opacity: 0.8,
  },
});
