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
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { useAuthStore } from '../../store/useAuthStore';
import { THEME } from '../../constants/theme';
import { insertarRecoleccion, marcarComoSincronizado } from '../../services/sqlite/database';
import { checkRecentCollection, uploadCollectionRecord } from '../../api/collections';

/**
 * QRScannerScreen — Flujo Unificado para Recolectores de Campo (EcoRuta Palín)
 *
 * Soporta de manera simultánea e integrada:
 * 1. Cámara Nativa del Smartphone (CameraView a pantalla completa sin colapso).
 * 2. Escáner Físico Bluetooth / USB (Modo Teclado HID) mediante TextInput invisible.
 *
 * Ambas vías convergen en la misma función de procesamiento:
 * Validación de Cooldown (18 horas) → Botones Ágiles → Guardado SQLite & Supabase.
 */
export default function QRScannerScreen() {
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
      if (scanned || isGettingLocation || isSaving) return;

      const rawId = (data || '').trim();
      if (!rawId) return;

      Vibration.vibrate(80); // Feedback háptico inmediato
      setScanned(true);
      setScannedCitizenId(rawId);
      setIsGettingLocation(true);

      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setCurrentCoords({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: Math.round(location.coords.accuracy || 0),
        });
      } catch {
        // Fallback a coordenadas de Palín, Escuintla si GPS no responde
        setCurrentCoords({
          latitude: 14.4042,
          longitude: -90.6978,
          accuracy: 999,
          isFallback: true,
        });
      } finally {
        setIsGettingLocation(false);
      }
    },
    [scanned, isGettingLocation, isSaving]
  );

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

            {/* ID del ciudadano escaneado */}
            <View style={styles.citizenBadge}>
              <Text style={styles.citizenLabel}>CIUDADANO DETECTADO</Text>
              <Text style={styles.citizenId} numberOfLines={1} ellipsizeMode="middle">
                {scannedCitizenId}
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
      </View>
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
});
