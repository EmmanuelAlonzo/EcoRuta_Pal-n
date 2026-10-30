import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/useAuthStore';
import { THEME } from '../../constants/theme';
import { getClientProfile, getClientCollections } from '../../api/client';

export default function ClientHomeScreen({ navigation }) {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const logout = useAuthStore((state) => state.logout);

  const [points, setPoints] = useState(
    profile?.puntos_reciclaje ?? profile?.puntos_acumulados ?? 0
  );
  const [collections, setCollections] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ─── CÁLCULO DE MÉTRICAS DE IMPACTO AMBIENTAL ─────────────────────────────
  // (puntos * 0.5) = kg de CO2 reducidos
  const co2Reducido = (points * 0.5).toFixed(1);
  // (puntos / 100) = árboles salvados
  const arbolesSalvados = (points / 100).toFixed(2);

  // ─── GAMIFICACIÓN Y SISTEMA DE NIVELES ECOLÓGICOS ─────────────────────────
  const getEcoLevel = (pts) => {
    if (pts <= 100) {
      const min = 0;
      const max = 100;
      const pct = Math.min(100, Math.max(0, ((pts - min) / (max - min)) * 100));
      return {
        level: 1,
        title: 'Nivel 1: Semilla',
        badge: 'Semilla',
        icon: '🌱',
        currentPts: pts,
        maxPts: max,
        progress: pct,
        remaining: max - pts,
        nextTitle: 'Brote',
        color: '#10B981',
      };
    } else if (pts <= 300) {
      const min = 100;
      const max = 300;
      const pct = Math.min(100, Math.max(0, ((pts - min) / (max - min)) * 100));
      return {
        level: 2,
        title: 'Nivel 2: Brote',
        badge: 'Brote',
        icon: '🌿',
        currentPts: pts,
        maxPts: max,
        progress: pct,
        remaining: max - pts,
        nextTitle: 'Árbol Guardián',
        color: '#059669',
      };
    } else if (pts <= 600) {
      const min = 300;
      const max = 600;
      const pct = Math.min(100, Math.max(0, ((pts - min) / (max - min)) * 100));
      return {
        level: 3,
        title: 'Nivel 3: Árbol',
        badge: 'Árbol',
        icon: '🌳',
        currentPts: pts,
        maxPts: max,
        progress: pct,
        remaining: max - pts,
        nextTitle: 'Bosque Protector',
        color: '#0F766E',
      };
    } else {
      return {
        level: 4,
        title: 'Nivel 4: Bosque Protector',
        badge: 'Bosque Protector',
        icon: '🌲',
        currentPts: pts,
        maxPts: 1000,
        progress: 100,
        remaining: 0,
        nextTitle: 'Nivel Máximo',
        color: '#047857',
      };
    }
  };

  const ecoLevel = getEcoLevel(points);

  // ─── HELPERS PARA FORMATO Y MATERIALES ────────────────────────────────────
  const getMaterialDetails = (tipo) => {
    const key = (tipo || '').toLowerCase();
    if (key.includes('separad') && !key.includes('no')) return { name: 'Residuos Separados', icon: '♻️', color: '#059669' };
    if (key.includes('no_separad') || key.includes('no separad')) return { name: 'Residuos No Separados', icon: '🚫', color: '#DC2626' };
    if (key.includes('plast')) return { name: 'Plástico (PET)', icon: '🧴', color: '#0284C7' };
    if (key.includes('cart') || key.includes('papel')) return { name: 'Cartón y Papel', icon: '📦', color: '#D97706' };
    if (key.includes('alum') || key.includes('metal')) return { name: 'Aluminio / Latas', icon: '🥫', color: '#DC2626' };
    if (key.includes('vidr')) return { name: 'Vidrio', icon: '🍾', color: '#059669' };
    return { name: tipo || 'Reciclaje General', icon: '♻️', color: THEME.colors.primary };
  };

  const formatDate = (isoString) => {
    if (!isoString) return 'Fecha no disponible';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('es-GT', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  // ─── CARGA DE DATOS REALES DESDE SUPABASE ─────────────────────────────────
  const loadData = useCallback(async (isPullToRefresh = false) => {
    if (isPullToRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      if (user?.id) {
        // 1. Refrescar saldo del perfil
        try {
          const updatedProfile = await getClientProfile(user.id);
          if (updatedProfile) {
            const currentBalance =
              updatedProfile.puntos_reciclaje ?? updatedProfile.puntos_acumulados ?? 0;
            setPoints(currentBalance);
          }
        } catch (profileErr) {
          console.warn('[ClientHome] Error refrescando perfil:', profileErr.message);
        }

        // 2. Consultar historial de recolecciones
        const historyData = await getClientCollections(user.id);
        setCollections(historyData || []);
      } else {
        setCollections([]);
      }
    } catch (err) {
      console.error('[ClientHome] Error cargando recolecciones reales:', err);
      setCollections([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadData();
    });
    return unsubscribe;
  }, [navigation, loadData]);

  const userIdReal = user?.id || '';
  const qrUrl = userIdReal
    ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(userIdReal)}&margin=10`
    : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={THEME.colors.primary} />
          <Text style={styles.loadingText}>Cargando tu Súper Panel EcoRuta...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadData(true)}
              colors={[THEME.colors.primary]}
              tintColor={THEME.colors.primary}
            />
          }
        >
          {/* ── 1. ENCABEZADO INSTITUCIONAL Y BIENVENIDA ─────────────────── */}
          <View style={styles.topBar}>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>🌱 Ciudadano Responsable</Text>
            </View>
            <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.8}>
              <Text style={styles.logoutBtnText}>Salir</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.welcomeSection}>
            <Text style={styles.welcomeGreeting}>
              ¡Hola, {profile?.nombre_completo || 'Vecino de Palín'}! 👋
            </Text>
            <View style={styles.locationRow}>
              <Text style={styles.locationIcon}>📍</Text>
              <Text style={styles.locationText}>
                {profile?.direccion || 'Palín, Escuintla'} • Sector Activo
              </Text>
            </View>
          </View>

          {/* ── 2. DASHBOARD DE IMPACTO AMBIENTAL ────────────────────────── */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeaderTitle}>🌍 Tu Impacto Ambiental</Text>
            <View style={styles.liveIndicator}>
              <View style={styles.liveIndicatorDot} />
              <Text style={styles.liveIndicatorText}>En Vivo</Text>
            </View>
          </View>

          <View style={styles.metricsGrid}>
            {/* Tarjeta 1: Eco-Puntos */}
            <View style={[styles.metricCard, styles.metricCardPrimary]}>
              <View style={styles.metricCardTop}>
                <View style={[styles.metricIconCircle, { backgroundColor: '#D1FAE5' }]}>
                  <Text style={styles.metricIconText}>🍃</Text>
                </View>
                <Text style={styles.metricPill}>Saldo Activo</Text>
              </View>
              <Text style={styles.metricValuePrimary}>{points}</Text>
              <Text style={styles.metricLabelPrimary}>Eco-Puntos acumulados</Text>
            </View>

            <View style={styles.metricsTwoColumnRow}>
              {/* Tarjeta 2: CO2 Reducido */}
              <View style={[styles.metricCardMini, { marginRight: 8 }]}>
                <View style={[styles.metricIconCircleSmall, { backgroundColor: '#E0F2FE' }]}>
                  <Text style={styles.metricIconTextSmall}>☁️</Text>
                </View>
                <Text style={styles.metricValueMini}>{co2Reducido} kg</Text>
                <Text style={styles.metricLabelMini}>CO₂ reducidos</Text>
                <Text style={styles.metricFormulaHint}>Puntos × 0.5 kg</Text>
              </View>

              {/* Tarjeta 3: Árboles Salvados */}
              <View style={[styles.metricCardMini, { marginLeft: 8 }]}>
                <View style={[styles.metricIconCircleSmall, { backgroundColor: '#DCFCE7' }]}>
                  <Text style={styles.metricIconTextSmall}>🌳</Text>
                </View>
                <Text style={styles.metricValueMini}>{arbolesSalvados}</Text>
                <Text style={styles.metricLabelMini}>Árboles salvados</Text>
                <Text style={styles.metricFormulaHint}>Puntos ÷ 100</Text>
              </View>
            </View>
          </View>

          {/* ── 3. GAMIFICACIÓN Y BARRA DE PROGRESO ───────────────────────── */}
          <View style={styles.gamificationCard}>
            <View style={styles.gamificationHeader}>
              <View style={styles.levelBadgeContainer}>
                <Text style={styles.levelIconLarge}>{ecoLevel.icon}</Text>
                <View>
                  <Text style={styles.gamificationSubLabel}>RANGO ECOLÓGICO ACTUAL</Text>
                  <Text style={styles.gamificationTitle}>{ecoLevel.title}</Text>
                </View>
              </View>
              <View style={styles.levelTag}>
                <Text style={styles.levelTagText}>Nivel {ecoLevel.level}</Text>
              </View>
            </View>

            {/* Barra Visual de Progreso */}
            <View style={styles.progressTrack}>
              <View style={[styles.progressBar, { width: `${ecoLevel.progress}%` }]} />
            </View>

            <View style={styles.progressInfoRow}>
              <Text style={styles.progressPointsLabel}>
                {points} / {ecoLevel.maxPts} pts
              </Text>
              <Text style={styles.progressPercentLabel}>
                {Math.round(ecoLevel.progress)}%
              </Text>
            </View>

            <View style={styles.nextLevelCallout}>
              {ecoLevel.remaining > 0 ? (
                <Text style={styles.nextLevelText}>
                  🎯 Te faltan <Text style={styles.boldGreenText}>{ecoLevel.remaining} puntos</Text> para subir a <Text style={styles.boldText}>{ecoLevel.nextTitle}</Text>.
                </Text>
              ) : (
                <Text style={styles.nextLevelText}>
                  🏆 ¡Felicitaciones! Has alcanzado el rango máximo como protector del medio ambiente en Palín.
                </Text>
              )}
            </View>
          </View>

          {/* ── 4. CÓDIGO QR MEJORADO (CREDENCIAL DIGITAL / BOLETO) ───────── */}
          <View style={styles.ticketCard}>
            {/* Franja Superior de la Credencial */}
            <View style={styles.ticketHeaderBand}>
              <View style={styles.ticketSealRow}>
                <Text style={styles.ticketSealIcon}>🏛️</Text>
                <View>
                  <Text style={styles.ticketOrgTitle}>MUNICIPALIDAD DE PALÍN</Text>
                  <Text style={styles.ticketOrgSubtitle}>Dirección de Gestión Ambiental y Reciclaje</Text>
                </View>
              </View>
              <View style={styles.ticketBadge}>
                <Text style={styles.ticketBadgeText}>ECO-PASE 2026</Text>
              </View>
            </View>

            {/* Datos del Ciudadano en la Credencial */}
            <View style={styles.ticketCitizenSection}>
              <Text style={styles.ticketCitizenLabel}>TITULAR DE LA VIVIENDA</Text>
              <Text style={styles.ticketCitizenName}>
                {profile?.nombre_completo || 'Ciudadano de Palín'}
              </Text>
              <Text style={styles.ticketCitizenAddress}>
                📍 {profile?.direccion || 'Palín, Escuintla'}
              </Text>
            </View>

            {/* Perforación decorativa de boleto / ticket */}
            <View style={styles.ticketPerforationRow}>
              <View style={styles.ticketNotchLeft} />
              <View style={styles.ticketDashedLine} />
              <View style={styles.ticketNotchRight} />
            </View>

            {/* Contenedor del Código QR */}
            <View style={styles.ticketQrContainer}>
              <View style={styles.qrShadowBox}>
                {qrUrl ? (
                  <Image
                    source={{ uri: qrUrl }}
                    style={styles.qrImage}
                    resizeMode="contain"
                  />
                ) : (
                  <ActivityIndicator size="large" color={THEME.colors.primary} />
                )}
              </View>

              {/* Mensaje destacado para el operario del camión */}
              <View style={styles.highlightNoticeBox}>
                <View style={styles.highlightNoticeHeader}>
                  <Text style={styles.highlightNoticeIcon}>📢</Text>
                  <Text style={styles.highlightNoticeTitle}>
                    Muestra este código al operario del camión
                  </Text>
                </View>
                <Text style={styles.highlightNoticeDesc}>
                  El personal de campo escaneará tu credencial para registrar tus bolsas de reciclaje y acreditar tus puntos automáticamente.
                </Text>
              </View>

              {/* Pie de la Credencial con UUID */}
              <View style={styles.ticketFooter}>
                <Text style={styles.ticketFooterLabel}>ID CIUDADANO (SUPABASE):</Text>
                <Text style={styles.ticketFooterCode} numberOfLines={1} ellipsizeMode="middle">
                  {userIdReal || 'No autenticado'}
                </Text>
              </View>
            </View>
          </View>

          {/* ── 5. ACCESO DIRECTO A CANJE DE PREMIOS ─────────────────────── */}
          <TouchableOpacity
            style={styles.rewardsBanner}
            onPress={() => navigation?.navigate?.('ClientRewards')}
            activeOpacity={0.85}
          >
            <View style={styles.rewardsBannerLeft}>
              <Text style={styles.rewardsBannerEmoji}>🎁</Text>
              <View>
                <Text style={styles.rewardsBannerTitle}>¿Listo para canjear tus puntos?</Text>
                <Text style={styles.rewardsBannerSubtitle}>
                  Tienes {points} pts disponibles en el Catálogo de Palín
                </Text>
              </View>
            </View>
            <View style={styles.rewardsBannerArrow}>
              <Text style={styles.rewardsBannerArrowText}>→</Text>
            </View>
          </TouchableOpacity>

          {/* ── 6. HISTORIAL DE ENTREGAS RECIENTES ───────────────────────── */}
          <View style={styles.historySectionHeader}>
            <View>
              <Text style={styles.sectionHeaderTitle}>📋 Entregas Recientes</Text>
              <Text style={styles.sectionHeaderDesc}>
                {collections.length} recolección(es) registrada(s) en tu ruta
              </Text>
            </View>
          </View>

          {collections.length === 0 ? (
            <View style={styles.emptyStateCard}>
              <Text style={styles.emptyStateIcon}>🚛</Text>
              <Text style={styles.emptyStateTitle}>Aún no hay entregas registradas</Text>
              <Text style={styles.emptyStateDesc}>
                Cuando el camión recolector municipal pase frente a tu hogar y escanee tu credencial digital, verás reflejados tus comprobantes y eco-puntos en este panel.
              </Text>
            </View>
          ) : (
            collections.slice(0, 5).map((item) => {
              const mat = getMaterialDetails(item.tipo_material);
              return (
                <View key={item.id?.toString() || Math.random().toString()} style={styles.historyCard}>
                  <View style={[styles.historyIconBadge, { backgroundColor: mat.color + '18' }]}>
                    <Text style={styles.historyIconText}>{mat.icon}</Text>
                  </View>
                  <View style={styles.historyDetails}>
                    <Text style={styles.historyTitle}>{mat.name}</Text>
                    <Text style={styles.historyDate}>{formatDate(item.fecha_recoleccion)}</Text>
                    <Text style={styles.historyWeight}>
                      {item.peso_kg > 0 ? `Peso: ${item.peso_kg} kg` : (item.puntos_otorgados > 0 ? 'Residuo clasificado' : 'Sin clasificar')}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.historyPointsBadge,
                      item.puntos_otorgados <= 0 && styles.historyPointsBadgeZero,
                    ]}
                  >
                    <Text
                      style={[
                        styles.historyPointsText,
                        item.puntos_otorgados <= 0 && styles.historyPointsTextZero,
                      ]}
                    >
                      +{item.puntos_otorgados} pts
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 100, // REQUERIMIENTO: Evita que el Bottom Tab Bar tape el contenido
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    marginTop: 12,
    fontWeight: '600',
  },

  // Encabezado
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  roleBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  roleBadgeText: {
    color: '#065F46',
    fontWeight: '700',
    fontSize: 12,
  },
  logoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
  },
  logoutBtnText: {
    color: THEME.colors.danger,
    fontWeight: '700',
    fontSize: 12,
  },
  welcomeSection: {
    marginBottom: 18,
  },
  welcomeGreeting: {
    fontSize: 24,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    letterSpacing: -0.5,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  locationIcon: {
    fontSize: 13,
    marginRight: 4,
  },
  locationText: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    fontWeight: '500',
  },

  // Sección Títulos
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  sectionHeaderDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
    marginRight: 5,
  },
  liveIndicatorText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },

  // 1. Dashboard de Impacto Ambiental
  metricsGrid: {
    marginBottom: 18,
  },
  metricCard: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  metricCardPrimary: {
    backgroundColor: '#064E3B', // Verde oscuro bosque de alto impacto
  },
  metricCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricIconText: {
    fontSize: 22,
  },
  metricPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    color: '#D1FAE5',
    fontWeight: '700',
    fontSize: 11,
  },
  metricValuePrimary: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 10,
    letterSpacing: -0.5,
  },
  metricLabelPrimary: {
    fontSize: 14,
    color: '#A7F3D0',
    fontWeight: '600',
    marginTop: 2,
  },
  metricsTwoColumnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricCardMini: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  metricIconCircleSmall: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  metricIconTextSmall: {
    fontSize: 18,
  },
  metricValueMini: {
    fontSize: 20,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  metricLabelMini: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  metricFormulaHint: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 4,
    fontStyle: 'italic',
  },

  // 2. Gamificación y Barra de Progreso
  gamificationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  gamificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  levelBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  levelIconLarge: {
    fontSize: 32,
    marginRight: 10,
  },
  gamificationSubLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
    letterSpacing: 0.5,
  },
  gamificationTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  levelTag: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  levelTagText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  progressTrack: {
    height: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 6,
  },
  progressInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  progressPointsLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  progressPercentLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },
  nextLevelCallout: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: THEME.colors.primary,
  },
  nextLevelText: {
    fontSize: 12,
    color: THEME.colors.textPrimary,
    lineHeight: 16,
  },
  boldGreenText: {
    fontWeight: '800',
    color: '#059669',
  },
  boldText: {
    fontWeight: '700',
  },

  // 3. Código QR Mejorado (Credencial Digital / Boleto)
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    // Sombras potentes estilo credencial
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 6,
    overflow: 'hidden',
  },
  ticketHeaderBand: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ticketSealRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ticketSealIcon: {
    fontSize: 22,
    marginRight: 8,
  },
  ticketOrgTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  ticketOrgSubtitle: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '500',
  },
  ticketBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  ticketBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 10,
  },
  ticketCitizenSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  ticketCitizenLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
    letterSpacing: 0.5,
  },
  ticketCitizenName: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  ticketCitizenAddress: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },

  // Perforación de Boleto
  ticketPerforationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  ticketNotchLeft: {
    width: 14,
    height: 24,
    backgroundColor: THEME.colors.background,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: '#CBD5E1',
  },
  ticketDashedLine: {
    flex: 1,
    height: 1,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    marginHorizontal: 8,
  },
  ticketNotchRight: {
    width: 14,
    height: 24,
    backgroundColor: THEME.colors.background,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    borderWidth: 1,
    borderRightWidth: 0,
    borderColor: '#CBD5E1',
  },

  ticketQrContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 8,
    alignItems: 'center',
  },
  qrShadowBox: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    marginBottom: 16,
  },
  qrImage: {
    width: 210,
    height: 210,
  },
  highlightNoticeBox: {
    width: '100%',
    backgroundColor: '#FEF3C7', // Ámbar suave de alta visibilidad
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 14,
  },
  highlightNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  highlightNoticeIcon: {
    fontSize: 15,
    marginRight: 6,
  },
  highlightNoticeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
    flex: 1,
  },
  highlightNoticeDesc: {
    fontSize: 11,
    color: '#78350F',
    lineHeight: 15,
  },
  ticketFooter: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  ticketFooterLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
  },
  ticketFooterCode: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    maxWidth: '55%',
  },

  // 4. Banner de Canjes
  rewardsBanner: {
    backgroundColor: '#ECFDF5',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 20,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  rewardsBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rewardsBannerEmoji: {
    fontSize: 28,
    marginRight: 12,
  },
  rewardsBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#065F46',
  },
  rewardsBannerSubtitle: {
    fontSize: 11,
    color: '#047857',
    marginTop: 2,
  },
  rewardsBannerArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  rewardsBannerArrowText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },

  // 5. Historial de Entregas
  historySectionHeader: {
    marginBottom: 12,
  },
  emptyStateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  emptyStateIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 6,
  },
  emptyStateDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  historyIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  historyIconText: {
    fontSize: 20,
  },
  historyDetails: {
    flex: 1,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  historyDate: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  historyWeight: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
    marginTop: 2,
  },
  historyPointsBadge: {
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  historyPointsBadgeZero: {
    backgroundColor: '#F1F5F9',
  },
  historyPointsText: {
    color: '#03543F',
    fontWeight: '800',
    fontSize: 12,
  },
  historyPointsTextZero: {
    color: '#64748B',
  },
});
