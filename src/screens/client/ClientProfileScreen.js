import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useAuthStore } from '../../store/useAuthStore';
import { THEME } from '../../constants/theme';
import { getClientProfile, updateClientProfile } from '../../api/client';
import { PALIN_QUADRANTS } from '../../api/logistics';
import EcoMap from '../../components/common/EcoMap';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Coordenadas base por defecto: Centro de Palín, Escuintla
const PALIN_CENTER = {
  latitude: 14.4042,
  longitude: -90.6978,
};

export default function ClientProfileScreen({ navigation }) {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const updateProfileState = useAuthStore((state) => state.updateProfileState);
  const logout = useAuthStore((state) => state.logout);

  // Estados del Formulario de Contacto y Vivienda
  const [nombreCompleto, setNombreCompleto] = useState(profile?.nombre_completo || '');
  const [telefono, setTelefono] = useState(profile?.telefono || '');
  const [direccion, setDireccion] = useState(profile?.direccion || '');

  // Coordenadas fijadas en el perfil
  const [latitud, setLatitud] = useState(
    profile?.latitud !== undefined && profile?.latitud !== null ? String(profile.latitud) : ''
  );
  const [longitud, setLongitud] = useState(
    profile?.longitud !== undefined && profile?.longitud !== null ? String(profile.longitud) : ''
  );

  // Estados de carga
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocatingGPS, setIsLocatingGPS] = useState(false);

  // Estados para Modal de Selección Geográfica en Mapa
  const [isMapModalVisible, setIsMapModalVisible] = useState(false);
  const [pinCoordinate, setPinCoordinate] = useState({
    latitude: profile?.latitud ? parseFloat(profile.latitud) : PALIN_CENTER.latitude,
    longitude: profile?.longitud ? parseFloat(profile.longitud) : PALIN_CENTER.longitude,
  });

  // Carga reactiva de perfil desde Supabase
  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const p = await getClientProfile(user.id);
      if (p) {
        setNombreCompleto(p.nombre_completo || '');
        setTelefono(p.telefono || '');
        setDireccion(p.direccion || '');

        const latVal = p.latitud ?? p.latitude;
        const lngVal = p.longitud ?? p.longitude;

        if (latVal && lngVal) {
          setLatitud(String(latVal));
          setLongitud(String(lngVal));
          setPinCoordinate({
            latitude: parseFloat(latVal),
            longitude: parseFloat(lngVal),
          });
        }
        updateProfileState(p);
      }
    } catch (err) {
      console.warn('[ClientProfileScreen] Error al consultar perfil:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, updateProfileState]);

  useEffect(() => {
    loadProfile();
    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadProfile();
    });
    return unsubscribe;
  }, [navigation, loadProfile]);

  // ─── ACCIÓN: OBTENER COORDENADAS CON EXPO-LOCATION (GPS DEL DISPOSITIVO) ───
  const handleGetCurrentLocation = async () => {
    setIsLocatingGPS(true);
    try {
      // 1. Solicitar permisos de geolocalización en primer plano
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          'Permiso Denegado',
          'EcoRuta requiere acceso al GPS para capturar la ubicación de tu vivienda. Puedes seleccionar tu casa manualmente en el mapa.'
        );
        setIsLocatingGPS(false);
        return;
      }

      // 2. Obtener posición GPS de alta precisión
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      if (location?.coords) {
        const { latitude, longitude } = location.coords;
        setPinCoordinate({ latitude, longitude });

        Alert.alert(
          '🎯 Ubicación Detectada',
          `GPS capturado exitosamente:\nLatitud: ${latitude.toFixed(5)}\nLongitud: ${longitude.toFixed(5)}\n\nEl pin del mapa se ha centrado en tu posición actual.`
        );
      }
    } catch (err) {
      console.error('[ClientProfileScreen] Error al obtener posición GPS:', err);
      Alert.alert(
        'Error de GPS',
        'No se pudo obtener la posición del dispositivo. Por favor verifica que el GPS esté activo o mueve el pin manualmente en el mapa.'
      );
    } finally {
      setIsLocatingGPS(false);
    }
  };

  // ─── ACCIÓN: INTERACTUAR CON EL PIN DEL MAPA ──────────────────────────────
  const handleMapPress = (coord) => {
    if (coord?.latitude && coord?.longitude) {
      setPinCoordinate({
        latitude: coord.latitude,
        longitude: coord.longitude,
      });
    }
  };

  // Saltar a cuadrantes predeterminados de Palín
  const handleJumpToQuadrant = (quadrantCoords) => {
    if (quadrantCoords?.lat && quadrantCoords?.lng) {
      setPinCoordinate({
        latitude: quadrantCoords.lat,
        longitude: quadrantCoords.lng,
      });
    }
  };

  // Confirmar coordenadas desde el Modal de Mapa
  const handleConfirmLocationModal = () => {
    setLatitud(pinCoordinate.latitude.toFixed(6));
    setLongitud(pinCoordinate.longitude.toFixed(6));
    setIsMapModalVisible(false);
  };

  // ─── ACCIÓN: GUARDAR PERFIL Y COORDENADAS EN SUPABASE ────────────────────
  const handleSaveProfile = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'No se ha detectado una sesión activa.');
      return;
    }

    if (!nombreCompleto.trim()) {
      Alert.alert('Campo Requerido', 'Por favor ingresa tu nombre completo.');
      return;
    }

    if (!direccion.trim()) {
      Alert.alert('Campo Requerido', 'Por favor ingresa la dirección de tu vivienda en Palín.');
      return;
    }

    const latNum = parseFloat(latitud);
    const lngNum = parseFloat(longitud);
    const hasCoordinates = !isNaN(latNum) && !isNaN(lngNum);

    setIsSaving(true);
    try {
      const updated = await updateClientProfile(user.id, {
        nombre_completo: nombreCompleto.trim(),
        telefono: telefono.trim(),
        direccion: direccion.trim(),
        latitud: hasCoordinates ? latNum : null,
        longitud: hasCoordinates ? lngNum : null,
      });

      // Actualizar estado reactivo global en Zustand
      updateProfileState(updated);

      Alert.alert(
        '✅ Perfil y Ubicación Guardados',
        `Tus datos de contacto y la ubicación de tu vivienda han sido actualizados en Supabase.\n\n${
          hasCoordinates
            ? '📍 Las cuadrillas y camiones de EcoRuta podrán ubicar tu hogar en sus mapas de ruta.'
            : '⚠️ Recuerda fijar la ubicación GPS de tu vivienda para un mejor servicio de recolección.'
        }`
      );
    } catch (err) {
      console.error('[ClientProfileScreen] Error al guardar perfil:', err);
      Alert.alert('Error al guardar', err.message || 'No se pudieron guardar los cambios en Supabase.');
    } finally {
      setIsSaving(false);
    }
  };

  const hasCoordsFixed = Boolean(latitud && longitud && !isNaN(parseFloat(latitud)) && !isNaN(parseFloat(longitud)));

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* ─── ENCABEZADO SUPERIOR ────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <View style={styles.badgeTag}>
              <Text style={styles.badgeTagText}>🌱 PORTAL CIUDADANO • PALÍN</Text>
            </View>
            <Text style={styles.title}>Mi Perfil y Ubicación</Text>
            <Text style={styles.subtitle}>
              Actualiza tus datos de contacto y georreferencia tu vivienda
            </Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.8}>
            <Text style={styles.logoutBtnText}>Salir</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={THEME.colors.primary} />
          <Text style={styles.loadingText}>Cargando información del perfil...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ─── TARJETA DE ESTADO DE GEOLOCALIZACIÓN ──────────────────────── */}
          <View style={[styles.geoStatusCard, hasCoordsFixed ? styles.geoCardOk : styles.geoCardPending]}>
            <View style={styles.geoStatusHeader}>
              <View style={styles.geoStatusIconBadge}>
                <Text style={styles.geoStatusIcon}>{hasCoordsFixed ? '🏠' : '📍'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.geoStatusRow}>
                  <Text style={styles.geoStatusTitle}>
                    {hasCoordsFixed ? 'Vivienda Georreferenciada' : 'Ubicación GPS Pendiente'}
                  </Text>
                  <View
                    style={[
                      styles.geoStatusBadge,
                      hasCoordsFixed ? styles.badgeGreen : styles.badgeAmber,
                    ]}
                  >
                    <Text
                      style={[
                        styles.geoStatusBadgeText,
                        hasCoordsFixed ? styles.badgeTextGreen : styles.badgeTextAmber,
                      ]}
                    >
                      {hasCoordsFixed ? '🟢 Fijada' : '🟡 Sin Fijar'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.geoStatusDesc}>
                  {hasCoordsFixed
                    ? `Coordenadas: Lat ${parseFloat(latitud).toFixed(5)}, Lng ${parseFloat(longitud).toFixed(5)}`
                    : 'Fija el pin de tu casa para que las cuadrillas de recolección localicen tus bolsas de reciclaje.'}
                </Text>
              </View>
            </View>

            {/* Botón Principal de Fijar Ubicación con Mapa */}
            <TouchableOpacity
              style={styles.fixLocationBtn}
              onPress={() => {
                setPinCoordinate({
                  latitude: hasCoordsFixed ? parseFloat(latitud) : PALIN_CENTER.latitude,
                  longitude: hasCoordsFixed ? parseFloat(longitud) : PALIN_CENTER.longitude,
                });
                setIsMapModalVisible(true);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.fixLocationBtnIcon}>🗺️</Text>
              <Text style={styles.fixLocationBtnText}>
                {hasCoordsFixed ? 'Modificar Ubicación de mi Vivienda' : 'Fijar Ubicación de mi Vivienda'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ─── FORMULARIO DE DATOS DE CONTACTO Y VIVIENDA (REQUERIMIENTO 1) ─ */}
          <View style={styles.formCard}>
            <View style={styles.formCardHeader}>
              <Text style={styles.formCardTitle}>📋 Datos de Contacto y Vivienda</Text>
              <Text style={styles.formCardSub}>
                Esta información permite coordinar visitas del camión y entregas de incentivos.
              </Text>
            </View>

            {/* Campo: Nombre Completo */}
            <Text style={styles.inputLabel}>Nombre Completo *</Text>
            <TextInput
              style={styles.textInput}
              value={nombreCompleto}
              onChangeText={setNombreCompleto}
              placeholder="Ej. Roberto Estrada"
              placeholderTextColor="#94A3B8"
            />

            {/* Campo: Correo Electrónico (Solo Lectura) */}
            <Text style={styles.inputLabel}>Correo Electrónico (Cuenta de Acceso)</Text>
            <TextInput
              style={[styles.textInput, styles.inputDisabled]}
              value={user?.email || profile?.email || 'Sin correo'}
              editable={false}
            />

            {/* Campo: Teléfono de Contacto */}
            <Text style={styles.inputLabel}>Teléfono de Contacto</Text>
            <TextInput
              style={styles.textInput}
              value={telefono}
              onChangeText={setTelefono}
              placeholder="Ej. +502 5555-1234"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
            />

            {/* Campo: Dirección Residencial */}
            <Text style={styles.inputLabel}>Dirección de la Vivienda (Palín, Escuintla) *</Text>
            <TextInput
              style={[styles.textInput, { height: 60 }]}
              value={direccion}
              onChangeText={setDireccion}
              placeholder="Ej. Callejón San Pedro, Lote 12, Zona 2..."
              placeholderTextColor="#94A3B8"
              multiline
            />

            {/* Vista Previa de Coordenadas Guardadas */}
            <View style={styles.coordsDisplayBox}>
              <View style={styles.coordsCol}>
                <Text style={styles.coordsLabel}>Latitud GPS</Text>
                <Text style={styles.coordsVal}>{latitud ? parseFloat(latitud).toFixed(6) : 'Pendiente'}</Text>
              </View>
              <View style={styles.coordsDivider} />
              <View style={styles.coordsCol}>
                <Text style={styles.coordsLabel}>Longitud GPS</Text>
                <Text style={styles.coordsVal}>{longitud ? parseFloat(longitud).toFixed(6) : 'Pendiente'}</Text>
              </View>
            </View>

            {/* Botón de Guardado */}
            <TouchableOpacity
              style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
              onPress={handleSaveProfile}
              disabled={isSaving}
              activeOpacity={0.85}
            >
              {isSaving ? (
                <View style={styles.btnRow}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.saveBtnText}> Guardando en Supabase...</Text>
                </View>
              ) : (
                <Text style={styles.saveBtnText}>💾 Guardar Perfil y Ubicación</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* ─── RESUMEN DE SALDO ECOLÓGICO ─────────────────────────────────── */}
          <View style={styles.pointsSummaryCard}>
            <View style={styles.pointsIconBadge}>
              <Text style={styles.pointsIcon}>🍃</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pointsTitle}>Saldo de Eco-Puntos</Text>
              <Text style={styles.pointsSub}>
                Puntos disponibles para canjear en comercios de Palín
              </Text>
            </View>
            <Text style={styles.pointsNumber}>
              {profile?.puntos_reciclaje ?? profile?.puntos_acumulados ?? 0} pts
            </Text>
          </View>
        </ScrollView>
      )}

      {/* ─── MODAL MAPA INTERACTIVO (EXPO-LOCATION + REACT-NATIVE-MAPS) ──── */}
      <Modal visible={isMapModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalMapCard}>
            {/* Cabecera del Modal de Mapa */}
            <View style={styles.modalMapHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalMapTag}>GEOLOCALIZACIÓN DE VIVIENDA</Text>
                <Text style={styles.modalMapTitle}>Fija el Pin de tu Casa</Text>
                <Text style={styles.modalMapSubtitle}>
                  Toca cualquier punto del mapa o usa el GPS de tu teléfono
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsMapModalVisible(false)}
              >
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Barra de Atajos de Cuadrantes de Palín */}
            <View style={styles.quadrantsBar}>
              <Text style={styles.quadrantsBarTitle}>Sectores Palín:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {Object.entries(PALIN_QUADRANTS).map(([qKey, qVal]) => (
                  <TouchableOpacity
                    key={qKey}
                    style={styles.quadrantChip}
                    onPress={() => handleJumpToQuadrant(qVal)}
                  >
                    <Text style={styles.quadrantChipText}>📍 {qKey}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* CONTENEDOR DEL MAPA (REACT-NATIVE-MAPS / ECOMAP) */}
            <View style={styles.mapContainer}>
              <EcoMap
                centerCoordinate={{
                  latitude: pinCoordinate.latitude,
                  longitude: pinCoordinate.longitude,
                }}
                markers={[
                  {
                    id: 'my-home-pin',
                    latitude: pinCoordinate.latitude,
                    longitude: pinCoordinate.longitude,
                    tipo: 'vivienda',
                    draggable: true,
                    onDragEnd: (newCoord) => {
                      if (newCoord?.latitude && newCoord?.longitude) {
                        setPinCoordinate(newCoord);
                      }
                    },
                    nombre_completo: 'Mi Vivienda',
                    title: '🏠 Ubicación de mi Vivienda',
                    description: 'Toca o arrastra para reubicar tu casa',
                  },
                ]}
                onMapPress={handleMapPress}
                height={350}
                zoomLevel={16}
              />

              {/* Botón Flotante: Usar GPS del Dispositivo (expo-location) */}
              <TouchableOpacity
                style={[styles.floatingGpsBtn, isLocatingGPS && styles.floatingGpsBtnActive]}
                onPress={handleGetCurrentLocation}
                disabled={isLocatingGPS}
                activeOpacity={0.85}
              >
                {isLocatingGPS ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.floatingGpsIcon}>🎯</Text>
                    <Text style={styles.floatingGpsText}>Mi Ubicación Actual (GPS)</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Información de Coordenadas Capturadas en Tiempo Real */}
            <View style={styles.currentCoordBar}>
              <View style={styles.coordInfoBlock}>
                <Text style={styles.coordInfoLabel}>Latitud:</Text>
                <Text style={styles.coordInfoValue}>{pinCoordinate.latitude.toFixed(6)}</Text>
              </View>
              <View style={styles.coordInfoBlock}>
                <Text style={styles.coordInfoLabel}>Longitud:</Text>
                <Text style={styles.coordInfoValue}>{pinCoordinate.longitude.toFixed(6)}</Text>
              </View>
            </View>

            {/* Botones de Acción del Modal */}
            <View style={styles.modalMapActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsMapModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleConfirmLocationModal}
                activeOpacity={0.85}
              >
                <Text style={styles.modalConfirmBtnText}>✅ Confirmar Esta Ubicación</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
    ...(Platform.OS === 'web' && {
      maxWidth: 900,
      width: '100%',
      alignSelf: 'center',
    }),
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  badgeTag: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  badgeTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  logoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  logoutBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    ...(Platform.OS === 'web' && {
      maxWidth: 900,
      width: '100%',
      alignSelf: 'center',
    }),
  },
  geoStatusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  geoCardOk: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  geoCardPending: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  geoStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  geoStatusIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  geoStatusIcon: {
    fontSize: 22,
  },
  geoStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  geoStatusTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  geoStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeGreen: {
    backgroundColor: '#DCFCE7',
  },
  badgeAmber: {
    backgroundColor: '#FEF3C7',
  },
  geoStatusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  badgeTextGreen: {
    color: '#15803D',
  },
  badgeTextAmber: {
    color: '#B45309',
  },
  geoStatusDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 3,
  },
  fixLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.primary,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
    gap: 8,
    shadowColor: THEME.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  fixLocationBtnIcon: {
    fontSize: 16,
  },
  fixLocationBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  formCardHeader: {
    marginBottom: 14,
  },
  formCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  formCardSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 5,
    marginTop: 10,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  inputDisabled: {
    backgroundColor: '#F1F5F9',
    color: '#94A3B8',
  },
  coordsDisplayBox: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  coordsCol: {
    flex: 1,
    alignItems: 'center',
  },
  coordsLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  coordsVal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  coordsDivider: {
    width: 1,
    backgroundColor: '#CBD5E1',
    marginVertical: 2,
  },
  saveBtn: {
    backgroundColor: THEME.colors.primaryDark,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: THEME.colors.primaryDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pointsSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  pointsIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointsIcon: {
    fontSize: 18,
  },
  pointsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  pointsSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  pointsNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: '#059669',
  },

  // Modal Mapa
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 14,
  },
  modalMapCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    maxHeight: '92%',
    ...(Platform.OS === 'web' && {
      maxWidth: 700,
      width: '100%',
      alignSelf: 'center',
    }),
  },
  modalMapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  modalMapTag: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.primaryDark,
    letterSpacing: 0.5,
  },
  modalMapTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 1,
  },
  modalMapSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalCloseBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#94A3B8',
  },
  quadrantsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 8,
    gap: 6,
  },
  quadrantsBarTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  quadrantChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginRight: 4,
  },
  quadrantChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
  },
  mapContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  floatingGpsBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F766E',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  floatingGpsBtnActive: {
    opacity: 0.8,
  },
  floatingGpsIcon: {
    fontSize: 14,
  },
  floatingGpsText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  currentCoordBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    gap: 12,
    justifyContent: 'space-around',
  },
  coordInfoBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  coordInfoLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  coordInfoValue: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalMapActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 11,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    alignItems: 'center',
  },
  modalCancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  modalConfirmBtn: {
    flex: 1.6,
    paddingVertical: 11,
    backgroundColor: THEME.colors.primary,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalConfirmBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

