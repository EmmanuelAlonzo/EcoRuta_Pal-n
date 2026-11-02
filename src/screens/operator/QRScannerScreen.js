import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Vibration,
  Alert,
  TextInput,
  Pressable,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { useAuthStore } from '../../store/useAuthStore';
import { THEME } from '../../constants/theme';
import { insertarRecoleccion, marcarComoSincronizado } from '../../services/sqlite/database';
import {
  checkRecentCollection,
  uploadCollectionRecord,
  getCitizenVerification,
  reportFraudLog,
} from '../../api/collections';

/**
 * QRScannerScreen — Flujo Unificado para Recolectores de Campo (EcoRuta Palín)
 *
 * Incluye:
 * 1. Cámara Nativa del Smartphone / Lector Físico Bluetooth HID.
 * 2. Validación Visual Antifraude en Pantalla Completa (Letras Gigantes para sol directo).
 * 3. Botones Masivos: Confirmar Vivienda vs Rechazar (Log de Fraude + GPS en Supabase).
 * 4. Validación de Cooldown (18 horas) y Guardado SQLite & Supabase.
 */
export default function QRScannerScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);

  // Referencia para el receptor HID de escáner Bluetooth
  const inputRef = useRef(null);
  const [scannerInputValue, setScannerInputValue] = useState('');

  // Permisos
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [locationStatus, setLocationStatus] = useState(null);

  // Estados del flujo
  const [scanned, setScanned] = useState(false);
  const [scannedCitizenId, setScannedCitizenId] = useState(null);
  const [currentCoords, setCurrentCoords] = useState(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Estados de Validación Visual Antifraude
  const [isValidatingCitizen, setIsValidatingCitizen] = useState(false);
  const [verificationModalVisible, setVerificationModalVisible] = useState(false);
  const [citizenData, setCitizenData] = useState(null);
  const [isRejecting, setIsRejecting] = useState(false);

  // Feedback al operario después de guardar
  const [lastAction, setLastAction] = useState(null); // { separado: bool, timestamp }

  useEffect(() => {
    checkAndRequestPermissions();
  }, []);

  // Mantener el foco activo siempre que la pantalla gane visibilidad
  useEffect(() => {
    if (isFocused) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isFocused, scanned]);

  const checkAndRequestPermissions = async () => {
    if (!cameraPermission?.granted) {
      await requestCameraPermission();
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationStatus(status);
    } catch {
      setLocationStatus('denied');
    }
  };

  /**
   * Recupera el foco en el TextInput oculto para el escáner Bluetooth HID
   */
  const ensureInputFocus = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  // ─── LÓGICA CENTRALIZADA DE PROCESAMIENTO DE QR ───────────────────────────
  // Llamada unificada tanto por la cámara como por el lector físico Bluetooth
  const handleBarcodeScanned = useCallback(
    async ({ data }) => {
      if (scanned || isGettingLocation || isSaving || isValidatingCitizen || verificationModalVisible || isRejecting) {
        return;
      }

      const rawId = (data || '').trim();
      if (!rawId) return;

      Vibration.vibrate(80); // Feedback háptico inmediato
      setScanned(true);
      setScannedCitizenId(rawId);
      setIsGettingLocation(true);
      setIsValidatingCitizen(true);

      let coords = null;
      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        coords = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: Math.round(location.coords.accuracy || 0),
        };
        setCurrentCoords(coords);
      } catch {
        // Fallback a coordenadas de Palín, Escuintla si GPS no responde
        coords = {
          latitude: 14.4042,
          longitude: -90.6978,
          accuracy: 999,
          isFallback: true,
        };
        setCurrentCoords(coords);
      } finally {
        setIsGettingLocation(false);
      }

      // ── REQUERIMIENTO 1: Consultar en Supabase datos del código escaneado ──
      try {
        const res = await getCitizenVerification(rawId);
        if (res.found && res.profile) {
          setCitizenData(res.profile);
        } else {
          setCitizenData({
            id: rawId,
            nombre_completo: 'Código No Registrado en el Padrón',
            direccion: 'Sin dirección oficial en base de datos',
            activo: false,
            estado_suscripcion: 'No Encontrado',
            notFound: true,
          });
        }
        // ── REQUERIMIENTO 2: Desplegar Modal de Pantalla Completa ──
        setVerificationModalVisible(true);
      } catch (err) {
        console.error('[QRScanner] Error en verificación previa en Supabase:', err);
        setCitizenData({
          id: rawId,
          nombre_completo: 'Fallo al Consultar Datos del Titular',
          direccion: 'Sin conexión a Supabase',
          activo: false,
          estado_suscripcion: 'Desconocido',
        });
        setVerificationModalVisible(true);
      } finally {
        setIsValidatingCitizen(false);
      }
    },
    [scanned, isGettingLocation, isSaving, isValidatingCitizen, verificationModalVisible, isRejecting]
  );

  // ── REQUERIMIENTO 3A: Confirmar Vivienda y Proceder a Recolectar ──────────
  const handleConfirmVivienda = () => {
    Vibration.vibrate(60);
    setVerificationModalVisible(false);
    console.log('✅ [QRScanner] Vivienda validada visualmente por el operario.');
  };

  // ── REQUERIMIENTO 3B & 4: Rechazar y Guardar Log de Posible Fraude en Supabase ──
  const handleRejectFraud = async () => {
    if (isRejecting) return;
    setIsRejecting(true);
    Vibration.vibrate([0, 150, 100, 150]);

    try {
      await reportFraudLog({
        qr_code: scannedCitizenId,
        cliente_id: citizenData?.id || scannedCitizenId,
        operario_id: user?.id || null,
        operario_nombre: profile?.nombre_completo || profile?.nombre || 'Operario de Ruta',
        codigo_camion: profile?.codigo_camion || 'Sin camión',
        ruta_asignada: profile?.ruta_asignada || 'Sin ruta',
        latitud: currentCoords?.latitude || null,
        longitud: currentCoords?.longitude || null,
        precision_gps: currentCoords?.accuracy || null,
        direccion_declarada: citizenData?.direccion || 'No disponible',
        titular_declarado: citizenData?.nombre_completo || 'No disponible',
        motivo: 'Dirección física incorrecta / Posible fraude detectado por operario',
      });

      Alert.alert(
        '⚠️ Alerta Antifraude Registrada',
        `Se guardó un reporte en Supabase para el código ${scannedCitizenId?.substring(0, 8)}... asociado a tus coordenadas GPS actuales (${currentCoords?.latitude?.toFixed(4)}, ${currentCoords?.longitude?.toFixed(4)}).\n\nLa recolección ha sido cancelada por discrepancia física.`,
        [{ text: 'Aceptar' }]
      );
    } catch (err) {
      console.error('[QRScanner] Error reportando fraude:', err);
      Alert.alert(
        'Aviso',
        'Se canceló la recolección por discrepancia de vivienda. Verifica tu conexión para sincronizar la alerta.'
      );
    } finally {
      setIsRejecting(false);
      setVerificationModalVisible(false);
      setScanned(false);
      setScannedCitizenId(null);
      setCitizenData(null);
      setCurrentCoords(null);
      setScannerInputValue('');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 200);
    }
  };

  /**
   * Manejador de eventos cuando el escáner Bluetooth físico envía un Enter
   */
  const handleScannerSubmit = useCallback(
    (textSubmitted) => {
      const barcodeData = (textSubmitted || scannerInputValue || '').trim();
      // Limpiar inmediatamente el TextInput
      setScannerInputValue('');
      if (inputRef.current) {
        inputRef.current.clear();
      }

      if (barcodeData) {
        handleBarcodeScanned({ data: barcodeData });
      }
    },
    [scannerInputValue, handleBarcodeScanned]
  );

  // ─── SOPORTE HARDWARE EN WEB (PC, MAC, TV): CAPTURA DIRECTA DE ESCÁNER HID ───
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && isFocused && !scanned) {
      let barcodeBuffer = '';
      let lastKeyTime = Date.now();

      const handleWebKeyDown = (e) => {
        // Ignorar si el usuario está interactuando con otro input del sistema
        if (e.target && e.target.tagName === 'INPUT' && e.target !== inputRef.current) {
          return;
        }

        const now = Date.now();
        // Los lectores de código de barra envían caracteres muy rápidamente (<50ms).
        // Si hay una pausa mayor a 600ms, reiniciamos el buffer para evitar concatenación de palabras.
        if (now - lastKeyTime > 600) {
          barcodeBuffer = '';
        }
        lastKeyTime = now;

        if (e.key === 'Enter') {
          if (barcodeBuffer.trim().length > 0) {
            e.preventDefault();
            const scannedCode = barcodeBuffer.trim();
            barcodeBuffer = '';
            handleBarcodeScanned({ data: scannedCode });
          }
        } else if (e.key.length === 1) {
          barcodeBuffer += e.key;
        }
      };

      window.addEventListener('keydown', handleWebKeyDown);
      return () => {
        window.removeEventListener('keydown', handleWebKeyDown);
      };
    }
  }, [isFocused, scanned, handleBarcodeScanned]);

  // ─── GUARDAR RECOLECCIÓN (COOLDOWN 18 HORAS & SQLITE/SUPABASE) ────────────
  const handleSaveCollection = useCallback(
    async (separado) => {
      if (isSaving || !scannedCitizenId) return;
      setIsSaving(true);

      try {
        // 1. VALIDACIÓN PREVIA (Read-before-write):
        const cooldown = await checkRecentCollection(scannedCitizenId, 18);

        // 2. BLOQUEO DE 18 HORAS:
        if (cooldown.isBlocked) {
          Vibration.vibrate([0, 250, 100, 250, 100, 250]); // Vibración de alerta

          Alert.alert(
            'QR Duplicado',
            'QR Duplicado - Esta vivienda ya registró una recolección en la ruta de hoy.',
            [{ text: 'Entendido' }]
          );

          // Abortar y rearmar el escáner inmediatamente
          setScannedCitizenId(null);
          setCurrentCoords(null);
          setScanned(false);
          setScannerInputValue('');
          setIsSaving(false);
          setTimeout(() => {
            inputRef.current?.focus();
          }, 150);
          return;
        }

        // 3. FLUJO NORMAL: Guardado de recolección
        const record = {
          id: `col_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          cliente_id: scannedCitizenId,
          operario_id: user?.id || null,
          operario_nombre: profile?.nombre_completo || profile?.nombre || 'Operario de Ruta',
          codigo_camion: profile?.codigo_camion || 'CAM-01',
          ruta_asignada: profile?.ruta_asignada || 'Zona 1',
          tipo_material: separado ? 'separado' : 'no_separado',
          material_nombre: separado ? 'Residuos Separados' : 'Residuos NO Separados',
          peso_kg: 0,
          puntos_otorgados: separado ? 10 : 0,
          latitud: currentCoords?.latitude || null,
          longitud: currentCoords?.longitude || null,
          precision_gps: currentCoords?.accuracy || null,
          fecha_recoleccion: new Date().toISOString(),
          separado: separado ? 1 : 0,
          sincronizado: 0,
        };

        // Guardado local offline-first en SQLite
        await insertarRecoleccion(record);

        // Subida en tiempo real a Supabase
        try {
          await uploadCollectionRecord(record);
          await marcarComoSincronizado(record.id);
          console.log('☁️ [QRScanner] Recolección sincronizada con Supabase.');
        } catch (uploadErr) {
          console.log('📡 [QRScanner] Guardada en SQLite (pendiente sincronización):', uploadErr.message);
        }

        setLastAction({ separado, timestamp: Date.now() });
        Vibration.vibrate([0, 60, 40, 60]); // Doble vibración = guardado exitoso
      } catch (err) {
        console.error('[QRScanner] Error procesando recolección:', err);
        Alert.alert('Error', 'Ocurrió un error al registrar la recolección.');
        setLastAction(null);
      } finally {
        setIsSaving(false);
        setScannedCitizenId(null);
        setCurrentCoords(null);
        setScanned(false);
        setScannerInputValue('');
        setTimeout(() => {
          inputRef.current?.focus();
        }, 150);
      }
    },
    [isSaving, scannedCitizenId, user?.id, profile, currentCoords]
  );

  // ─── BLOQUEO SI NO SE HA INICIALIZADO EL TURNO (CAMIÓN Y RUTA) ───────────
  if (!profile?.codigo_camion || !profile?.ruta_asignada) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.permissionIcon}>🚛</Text>
        <Text style={styles.permissionTitle}>Turno No Inicializado</Text>
        <Text style={styles.permissionDesc}>
          Debes confirmar tu código de camión y la ruta asignada en Palín antes de poder utilizar el escáner de campo.
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={() => navigation?.navigate?.('OperatorSetup')}
        >
          <Text style={styles.permissionButtonText}>Configurar Turno Ahora</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── PANTALLA DE PERMISOS ─────────────────────────────────────────────────
  if (!cameraPermission || locationStatus === null) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={THEME.colors.primary} />
        <Text style={styles.permissionText}>Verificando permisos de cámara y GPS...</Text>
      </View>
    );
  }

  if (!cameraPermission.granted || locationStatus !== 'granted') {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.permissionIcon}>🔒</Text>
        <Text style={styles.permissionTitle}>Permisos Necesarios</Text>
        <Text style={styles.permissionDesc}>
          EcoRuta Palín necesita acceso a la cámara y al GPS para registrar
          las recolecciones del camión en campo.
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={checkAndRequestPermissions}
        >
          <Text style={styles.permissionButtonText}>Conceder Permisos</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── INTERFAZ PRINCIPAL UNIFICADA ─────────────────────────────────────────
  return (
    <Pressable
      style={styles.rootContainer}
      onPress={ensureInputFocus}
    >
      {/* ── LISTENER OCULTO (ESCANER FÍSICO BLUETOOTH / TECLADO HID) ── */}
      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        autoFocus={true}
        showSoftInputOnFocus={false}
        inputMode={Platform.OS === 'web' ? 'text' : undefined}
        blurOnSubmit={false}
        value={scannerInputValue}
        onChangeText={setScannerInputValue}
        onSubmitEditing={(e) => handleScannerSubmit(e.nativeEvent.text)}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="default"
      />

      {/* ── CÁMARA NATIVA A PANTALLA COMPLETA ── */}
      {isFocused && (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        />
      )}

      {/* ── CAPA SUPERPUESTA (OVERLAY) CON pointerEvents="box-none" ── */}
      <View style={styles.overlayContainer} pointerEvents="box-none">
        {/* Encabezado */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <View style={styles.topInfo}>
            <Text style={styles.topTitle}>EcoRuta Palín • Operario</Text>
            <Text style={styles.topSubtitle}>
              Camión: {profile?.codigo_camion || 'CAM-01'} • {profile?.ruta_asignada || 'Ruta Palín'}
            </Text>
          </View>
          <View style={styles.topBadgesRow}>
            <View style={styles.scannerBadge}>
              <Text style={styles.scannerBadgeText}>📷 / ⌨️ HID</Text>
            </View>
            <View
              style={[
                styles.gpsPill,
                currentCoords ? styles.gpsPillActive : styles.gpsPillSearching,
              ]}
            >
              <Text style={styles.gpsPillText}>
                {isGettingLocation ? '📍 GPS…' : currentCoords ? '📍 GPS OK' : '📍 GPS'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── ESTADOS DE ESCANEO ── */}
        {!scanned ? (
          /* Estado A: Esperando QR (Cámara activa o lectura por Bluetooth) */
          <View style={styles.scannerCenter} pointerEvents="box-none">
            <View style={styles.scannerFrame} pointerEvents="none">
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
            <Text style={styles.frameInstructions}>
              Apunta la cámara o presiona el botón del escáner
            </Text>

            {/* Flash del último resultado */}
            {lastAction !== null && (
              <View
                style={[
                  styles.lastResultBadge,
                  lastAction.separado ? styles.badgeGreen : styles.badgeRed,
                ]}
              >
                <Text style={styles.lastResultText}>
                  {lastAction.separado
                    ? '✅ Recolección SEPARADA guardada (+10 pts)'
                    : '⚠️ Recolección NO SEPARADA guardada (0 pts)'}
                </Text>
              </View>
            )}
          </View>
        ) : (
          /* Estado B: QR leído — Botones de clasificación */
          <View style={styles.classifyContainer} pointerEvents="box-none">
            {isGettingLocation ? (
              <View style={styles.gpsLoading}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.gpsLoadingText}>Obteniendo coordenadas GPS…</Text>
              </View>
            ) : null}

            {/* Vivienda y Titular Confirmados */}
            <View style={styles.citizenBadge}>
              <View style={styles.verifiedTagRow}>
                <Text style={styles.verifiedTagDot}>🛡️</Text>
                <Text style={styles.citizenLabel}>VIVIENDA CONFIRMADA VISUALMENTE</Text>
              </View>
              <Text style={styles.citizenNameConfirmed} numberOfLines={1}>
                {citizenData?.nombre_completo || 'Titular de Palín'}
              </Text>
              <Text style={styles.citizenAddressConfirmed} numberOfLines={2}>
                📍 {citizenData?.direccion || scannedCitizenId}
              </Text>
            </View>

            {/* Botón SEPARADOS */}
            <TouchableOpacity
              style={[styles.classifyBtn, styles.btnSeparado]}
              onPress={() => handleSaveCollection(true)}
              disabled={isSaving || isGettingLocation}
              activeOpacity={0.85}
            >
              {isSaving ? (
                <ActivityIndicator size="large" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.classifyBtnIcon}>♻️</Text>
                  <Text style={styles.classifyBtnText}>Residuos{'\n'}SEPARADOS</Text>
                  <Text style={styles.classifyBtnSub}>+10 puntos al ciudadano</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Botón NO SEPARADOS */}
            <TouchableOpacity
              style={[styles.classifyBtn, styles.btnNoSeparado]}
              onPress={() => handleSaveCollection(false)}
              disabled={isSaving || isGettingLocation}
              activeOpacity={0.85}
            >
              {isSaving ? (
                <ActivityIndicator size="large" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.classifyBtnIcon}>🚫</Text>
                  <Text style={styles.classifyBtnText}>Residuos NO{'\n'}SEPARADOS</Text>
                  <Text style={styles.classifyBtnSub}>0 puntos acreditados</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Cancelar y volver a escanear */}
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                setScanned(false);
                setScannedCitizenId(null);
                setCitizenData(null);
                setCurrentCoords(null);
                setScannerInputValue('');
                setTimeout(() => {
                  inputRef.current?.focus();
                }, 150);
              }}
            >
              <Text style={styles.cancelBtnText}>↩ Cancelar y re-escanear</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── OVERLAY DE CARGA MIENTRAS SE CONSULTA SUPABASE ── */}
        {isValidatingCitizen && (
          <View style={styles.validatingOverlay}>
            <View style={styles.validatingCard}>
              <ActivityIndicator size="large" color={THEME.colors.primary} />
              <Text style={styles.validatingTitle}>Consultando Datos en Supabase...</Text>
              <Text style={styles.validatingSubtitle}>
                Verificando titular, dirección física y suscripción del inmueble.
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* ── MODAL DE VALIDACIÓN VISUAL ANTIFRAUDE (PANTALLA COMPLETA - FÁCIL LECTURA BAJO EL SOL) ── */}
      <Modal
        visible={verificationModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={handleRejectFraud}
      >
        <SafeAreaView style={styles.antifraudModalContainer}>
          {/* Encabezado Superior de Alerta Antifraude */}
          <View style={styles.antifraudHeaderBand}>
            <Text style={styles.antifraudHeaderIcon}>🚨</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.antifraudHeaderTitle}>CONTROL ANTIFRAUDE</Text>
              <Text style={styles.antifraudHeaderSubtitle}>
                Verificación Visual Obligatoria de Inmueble
              </Text>
            </View>
            <View style={styles.antifraudSealBadge}>
              <Text style={styles.antifraudSealText}>PALÍN</Text>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.antifraudScroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Aviso Solar para Operario de Campo */}
            <View style={styles.solarBanner}>
              <Text style={styles.solarBannerEmoji}>☀️</Text>
              <Text style={styles.solarBannerText}>
                Comprueba que estés físicamente frente a esta dirección:
              </Text>
            </View>

            {/* 1. SECCIÓN PRINCIPAL: DIRECCIÓN FÍSICA EXACTA (LETRAS EXTRA GIGANTES DE MÁXIMO CONTRASTE) */}
            <View style={styles.giantAddressCard}>
              <View style={styles.giantLabelRow}>
                <Text style={styles.giantPinIcon}>📍</Text>
                <Text style={styles.giantLabel}>DIRECCIÓN FÍSICA REGISTRADA:</Text>
              </View>
              <Text style={styles.giantAddressText}>
                {citizenData?.direccion || 'SIN DIRECCIÓN EN BASE DE DATOS'}
              </Text>
            </View>

            {/* 2. SECCIÓN: NOMBRE DEL TITULAR (LETRAS MUY GRANDES) */}
            <View style={styles.giantPersonCard}>
              <View style={styles.giantLabelRow}>
                <Text style={styles.giantUserIcon}>👤</Text>
                <Text style={styles.giantLabel}>TITULAR DEL INMUEBLE:</Text>
              </View>
              <Text style={styles.giantPersonText}>
                {citizenData?.nombre_completo || 'Titular No Encontrado'}
              </Text>
              {citizenData?.email ? (
                <Text style={styles.giantPersonSub}>📧 {citizenData.email}</Text>
              ) : null}
            </View>

            {/* 3. SECCIÓN: ESTADO DE SUSCRIPCIÓN ECORUTA */}
            <View style={styles.subscriptionCard}>
              <Text style={styles.subscriptionLabel}>ESTADO DE SUSCRIPCIÓN:</Text>
              <View
                style={[
                  styles.subscriptionPill,
                  citizenData?.activo ? styles.subPillActive : styles.subPillInactive,
                ]}
              >
                <Text
                  style={[
                    styles.subscriptionText,
                    citizenData?.activo ? styles.subTextActive : styles.subTextInactive,
                  ]}
                >
                  {citizenData?.activo
                    ? '🟢 Suscripción Activa — Al Día'
                    : '🔴 Suscripción Inactiva / Suspendida'}
                </Text>
              </View>
            </View>

            {/* Posición GPS del Operario */}
            <View style={styles.gpsFootprintBox}>
              <Text style={styles.gpsFootprintLabel}>
                🛰️ Coordenadas GPS del Camión: {currentCoords?.latitude?.toFixed(5) || '0.00000'},{' '}
                {currentCoords?.longitude?.toFixed(5) || '0.00000'} (±{currentCoords?.accuracy || 0}m)
              </Text>
            </View>

            {/* ── BOTONES MASIVOS DE ACCIÓN INMEDIATA (REQUERIMIENTO 3) ── */}
            <View style={styles.massiveButtonsContainer}>
              {/* BOTÓN VERDE MASIVO: CONFIRMAR VIVIENDA Y RECOLECTAR */}
              <TouchableOpacity
                style={styles.massiveBtnConfirm}
                onPress={handleConfirmVivienda}
                disabled={isRejecting}
                activeOpacity={0.88}
              >
                <Text style={styles.massiveBtnIcon}>✓</Text>
                <Text style={styles.massiveBtnText}>Confirmar Vivienda y Recolectar</Text>
                <Text style={styles.massiveBtnSubtext}>
                  La dirección física coincide con el inmueble
                </Text>
              </TouchableOpacity>

              {/* BOTÓN ROJO MASIVO: RECHAZAR - DIRECCIÓN INCORRECTA (LOG FRAUDE + GPS - REQUERIMIENTO 4) */}
              <TouchableOpacity
                style={[styles.massiveBtnReject, isRejecting && styles.btnDisabled]}
                onPress={handleRejectFraud}
                disabled={isRejecting}
                activeOpacity={0.88}
              >
                {isRejecting ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.massiveBtnText}> Guardando Alerta en Supabase...</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.massiveBtnIcon}>✕</Text>
                    <Text style={styles.massiveBtnText}>Rechazar - Dirección Incorrecta</Text>
                    <Text style={styles.massiveBtnSubtext}>
                      Reportar alerta de fraude con coordenada GPS actual
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </Pressable>
  );
}

// ─── ESTILOS ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Contenedor raíz con flex: 1, 100% ancho y 100% alto explícitos
  rootContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
  // Capa superpuesta con pointerEvents="box-none" sobre la cámara
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    zIndex: 10,
  },
  // TextInput invisible pero siempre listo para capturar el escáner físico
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
    top: -100,
    left: -100,
  },
  centerContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: THEME.colors.background,
    ...(Platform.OS === 'web' && {
      maxWidth: 1200,
      alignSelf: 'center',
    }),
  },
  permissionIcon: { fontSize: 52, marginBottom: 14 },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 10,
  },
  permissionDesc: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  permissionText: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    marginTop: 12,
  },
  permissionButton: {
    backgroundColor: THEME.colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    ...(Platform.OS === 'web' && {
      maxWidth: 1200,
      width: '100%',
      alignSelf: 'center',
      borderRadius: 12,
      marginTop: 8,
    }),
  },
  topInfo: { flex: 1 },
  topTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  topSubtitle: {
    fontSize: 12,
    color: '#D1D5DB',
    marginTop: 2,
  },
  topBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scannerBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  scannerBadgeText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  gpsPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  gpsPillActive: { backgroundColor: '#10B981' },
  gpsPillSearching: { backgroundColor: '#F59E0B' },
  gpsPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scannerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerFrame: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: '#10B981',
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 },
  frameInstructions: {
    marginTop: 24,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    textAlign: 'center',
  },
  lastResultBadge: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  badgeGreen: {
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    borderColor: '#10B981',
  },
  badgeRed: {
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    borderColor: '#EF4444',
  },
  lastResultText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  classifyContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    zIndex: 20,
    ...(Platform.OS === 'web' && {
      maxWidth: 600,
      width: '100%',
      alignSelf: 'center',
      left: 'auto',
      right: 'auto',
    }),
  },
  gpsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  gpsLoadingText: {
    color: '#FFFFFF',
    fontSize: 13,
    marginLeft: 8,
    fontWeight: '600',
  },
  citizenBadge: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  citizenLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1,
  },
  citizenId: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 4,
  },
  classifyBtn: {
    borderRadius: 18,
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  btnSeparado: {
    backgroundColor: '#059669',
  },
  btnNoSeparado: {
    backgroundColor: '#DC2626',
  },
  classifyBtnIcon: {
    fontSize: 36,
    marginBottom: 4,
  },
  classifyBtnText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  classifyBtnSub: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '600',
    marginTop: 4,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },

  // ── ESTILOS DE VALIDACIÓN VISUAL ANTIFRAUDE (ALTO CONTRASTE BAJO EL SOL) ──
  validatingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 99,
  },
  validatingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: '90%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  validatingTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 14,
    textAlign: 'center',
  },
  validatingSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Resumen verificado en pantalla de clasificación
  verifiedTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  verifiedTagDot: {
    fontSize: 14,
    marginRight: 6,
  },
  citizenNameConfirmed: {
    fontSize: 17,
    fontWeight: '900',
    color: '#F8FAFC',
    textAlign: 'center',
  },
  citizenAddressConfirmed: {
    fontSize: 13,
    color: '#93C5FD',
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '700',
    lineHeight: 18,
  },

  // Contenedor Pantalla Completa Modal Antifraude
  antifraudModalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  antifraudHeaderBand: {
    backgroundColor: '#FEF08A', // Amarillo de alta visibilidad
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: '#EAB308',
  },
  antifraudHeaderIcon: {
    fontSize: 30,
    marginRight: 10,
  },
  antifraudHeaderTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#713F12',
    letterSpacing: 0.8,
  },
  antifraudHeaderSubtitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#A16207',
  },
  antifraudSealBadge: {
    backgroundColor: '#713F12',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  antifraudSealText: {
    color: '#FEF08A',
    fontWeight: '900',
    fontSize: 11,
  },
  antifraudScroll: {
    padding: 18,
    paddingBottom: 40,
    ...(Platform.OS === 'web' && {
      maxWidth: 680,
      width: '100%',
      alignSelf: 'center',
    }),
  },
  solarBanner: {
    backgroundColor: '#FEF9C3',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FDE047',
    marginBottom: 16,
  },
  solarBannerEmoji: {
    fontSize: 22,
    marginRight: 8,
  },
  solarBannerText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#713F12',
    flex: 1,
    lineHeight: 18,
  },

  // 1. TARJETA DE DIRECCIÓN FÍSICA EXACTA (LETRAS EXTRA GIGANTES DE MÁXIMO CONTRASTE)
  giantAddressCard: {
    backgroundColor: '#0F172A', // Fondo oscuro profundo para evitar reflejos solares
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 3.5,
    borderColor: '#38BDF8', // Cyan brillante de alto contraste
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  giantLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  giantPinIcon: {
    fontSize: 22,
    marginRight: 8,
  },
  giantLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#93C5FD',
    letterSpacing: 1,
  },
  giantAddressText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF', // Blanco nítido
    textAlign: 'center',
    lineHeight: 34,
    marginVertical: 4,
    letterSpacing: 0.2,
  },

  // 2. TARJETA DEL TITULAR (LETRAS MUY GRANDES)
  giantPersonCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 2.5,
    borderColor: '#CBD5E1',
  },
  giantUserIcon: {
    fontSize: 20,
    marginRight: 6,
  },
  giantPersonText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 28,
  },
  giantPersonSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '700',
  },

  // 3. ESTADO DE SUSCRIPCIÓN
  subscriptionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  subscriptionLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  subscriptionPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
  },
  subPillActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#16A34A',
  },
  subPillInactive: {
    backgroundColor: '#FEE2E2',
    borderColor: '#DC2626',
  },
  subscriptionText: {
    fontSize: 15,
    fontWeight: '900',
  },
  subTextActive: {
    color: '#15803D',
  },
  subTextInactive: {
    color: '#B91C1C',
  },

  // GPS
  gpsFootprintBox: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 20,
    alignItems: 'center',
  },
  gpsFootprintLabel: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '700',
  },

  // BOTONES MASIVOS DE ACCIÓN
  massiveButtonsContainer: {
    gap: 14,
  },
  massiveBtnConfirm: {
    backgroundColor: '#16A34A', // Verde de alta visibilidad
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#15803D',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  massiveBtnReject: {
    backgroundColor: '#DC2626', // Rojo de alerta
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#B91C1C',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  massiveBtnIcon: {
    fontSize: 32,
    color: '#FFFFFF',
    fontWeight: '900',
    marginBottom: 2,
  },
  massiveBtnText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  massiveBtnSubtext: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.92)',
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  btnDisabled: {
    opacity: 0.7,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
