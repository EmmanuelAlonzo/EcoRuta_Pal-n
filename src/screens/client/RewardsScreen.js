import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/useAuthStore';
import { THEME } from '../../constants/theme';
import { getClientProfile, getMerchantsWithOffers } from '../../api/client';

const { width } = Dimensions.get('window');

/**
 * Pantalla Unificada de Comercios e Incentivos / Beneficios (EcoRuta Palín).
 * - Muestra la lista de Comercios Afiliados con sus respectivas ofertas disponibles de `catalogo_incentivos`.
 * - Modal estilo "Cupón de Restaurante" con código QR dinámico basado en `codigo_vecino`.
 */
export default function RewardsScreen({ navigation }) {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);

  const [merchants, setMerchants] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('todos');
  const [expandedMerchants, setExpandedMerchants] = useState({});
  const [userPoints, setUserPoints] = useState(
    profile?.puntos_acumulados ?? 0
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Estados del Modal "Cupón de Restaurante"
  const [couponModalVisible, setCouponModalVisible] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [selectedMerchant, setSelectedMerchant] = useState(null);

  // Código de vecino y QR dinámico oficial
  const codigoVecino =
    profile?.codigo_vecino ||
    (user?.id ? `P-${user.id.substring(0, 6).toUpperCase()}` : 'P-PALIN');

  const couponQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
    codigoVecino
  )}&margin=10`;

  // ─── CARGA DE DATOS UNIFICADOS (COMERCIOS + OFERTAS) ───────────────────────
  const loadData = useCallback(async (isPullToRefresh = false) => {
    if (isPullToRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      // 1. Refrescar saldo del usuario desde Supabase
      if (user?.id) {
        try {
          const updatedProfile = await getClientProfile(user.id);
          if (updatedProfile) {
            useAuthStore.getState().updateProfileState(updatedProfile);
            setUserPoints(updatedProfile.puntos_acumulados ?? 0);
          }
        } catch (profileErr) {
          console.warn('[RewardsScreen] Error refrescando saldo en Supabase:', profileErr.message);
        }
      }

      // 2. Consultar Comercios con sus Ofertas agrupadas
      const data = await getMerchantsWithOffers();
      setMerchants(data || []);

      // Por defecto, expandir todos los comercios que tienen ofertas
      const initialExpanded = {};
      (data || []).forEach((m) => {
        initialExpanded[m.id] = true;
      });
      setExpandedMerchants(initialExpanded);
    } catch (err) {
      console.error('[RewardsScreen] Error cargando comercios y ofertas:', err);
      setMerchants([]);
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

  // Alternar acordeón de ofertas de un comercio
  const toggleMerchantAccordion = (merchantId) => {
    setExpandedMerchants((prev) => ({
      ...prev,
      [merchantId]: !prev[merchantId],
    }));
  };

  // Abrir Modal de Cupón de Restaurante
  const handleOpenCoupon = (offer, merchant) => {
    setSelectedOffer(offer);
    setSelectedMerchant(merchant);
    setCouponModalVisible(true);
  };

  // Filtro de categorías
  const categories = ['todos', ...new Set(merchants.map((m) => m.categoria).filter(Boolean))];

  const filteredMerchants = merchants.filter((m) => {
    if (selectedCategory === 'todos') return true;
    return m.categoria?.toLowerCase() === selectedCategory.toLowerCase();
  });

  // Insignias visuales según el tipo de promoción
  const getPromoBadge = (tipo = '') => {
    const t = tipo.toLowerCase();
    if (t.includes('2x1')) {
      return { label: 'PROMOCIÓN 2x1', color: '#D97706', bg: '#FEF3C7', icon: '🎁' };
    }
    if (t.includes('%') || t.includes('porcentaje')) {
      return { label: 'DESCUENTO %', color: '#059669', bg: '#D1FAE5', icon: '🏷️' };
    }
    return { label: 'DESCUENTO (Q)', color: '#2563EB', bg: '#DBEAFE', icon: '💸' };
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* ─── CABECERA DE LA PANTALLA ────────────────────────────────────────── */}
      <View style={styles.topHeader}>
        <View style={styles.topHeaderRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.tagPill}>
              <Text style={styles.tagPillText}>🏪 RED COMERCIAL PALÍN</Text>
            </View>
            <Text style={styles.screenTitle}>Comercios e Incentivos</Text>
            <Text style={styles.screenSubtitle}>
              Canjea tus puntos por descuentos exclusivos en comercios locales.
            </Text>
          </View>
          <View style={styles.pointsBadgeHeader}>
            <Text style={styles.pointsBadgeIcon}>⭐</Text>
            <Text style={styles.pointsBadgeVal}>{userPoints}</Text>
            <Text style={styles.pointsBadgeLbl}>pts</Text>
          </View>
        </View>

        {/* CINTA DE CÓDIGO DE VECINO */}
        <View style={styles.neighborCodeBar}>
          <Text style={styles.neighborCodeLabel}>TU CÓDIGO DE CANJE:</Text>
          <Text style={styles.neighborCodeValue}>{codigoVecino}</Text>
        </View>

        {/* FILTROS DE CATEGORÍA */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryScrollContent}
        >
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.catChip, isSelected && styles.catChipActive]}
                onPress={() => setSelectedCategory(cat)}
                activeOpacity={0.8}
              >
                <Text style={[styles.catChipText, isSelected && styles.catChipTextActive]}>
                  {cat === 'todos' ? '🌟 Todos' : cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ─── LISTADO DE COMERCIOS CON SUS OFERTAS ──────────────────────────── */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={THEME.colors.primary} />
          <Text style={styles.loadingText}>Cargando comercios y ofertas en Palín...</Text>
        </View>
      ) : (
        <ScrollView
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
          {filteredMerchants.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>🏪</Text>
              <Text style={styles.emptyTitle}>No hay comercios en esta categoría</Text>
              <Text style={styles.emptyDesc}>
                Pronto se sumarán más establecimientos aliados con ofertas exclusivas en Palín.
              </Text>
            </View>
          ) : (
            filteredMerchants.map((merchant) => {
              const isExpanded = !!expandedMerchants[merchant.id];
              const offersCount = merchant.ofertas ? merchant.ofertas.length : 0;

              return (
                <View key={merchant.id} style={styles.merchantCard}>
                  {/* CABECERA DEL COMERCIO (TOCABLE PARA EXPANDIR/COLAPSAR) */}
                  <TouchableOpacity
                    style={styles.merchantHeader}
                    onPress={() => toggleMerchantAccordion(merchant.id)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.merchantIconWrap}>
                      <Text style={styles.merchantIconText}>{merchant.icono || '🏪'}</Text>
                    </View>

                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.merchantName}>{merchant.nombre}</Text>
                      <Text style={styles.merchantCategoryBadge}>{merchant.categoria}</Text>
                      <Text style={styles.merchantAddress}>📍 {merchant.direccion}</Text>
                      {merchant.horario ? (
                        <Text style={styles.merchantSchedule}>🕒 {merchant.horario}</Text>
                      ) : null}
                    </View>

                    <View style={styles.accordionIndicator}>
                      <View style={styles.offersCountBadge}>
                        <Text style={styles.offersCountText}>
                          {offersCount} {offersCount === 1 ? 'oferta' : 'ofertas'}
                        </Text>
                      </View>
                      <Text style={styles.accordionArrow}>{isExpanded ? '▲' : '▼'}</Text>
                    </View>
                  </TouchableOpacity>

                  {/* SUBSECCIÓN: OFERTAS DISPONIBLES DEL COMERCIO */}
                  {isExpanded && (
                    <View style={styles.offersContainer}>
                      <View style={styles.offersSectionHeader}>
                        <Text style={styles.offersSectionTitle}>🏷️ Ofertas e Incentivos Disponibles</Text>
                      </View>

                      {offersCount === 0 ? (
                        <View style={styles.noOffersBox}>
                          <Text style={styles.noOffersText}>
                            Pronto este establecimiento publicará nuevas promociones para ti.
                          </Text>
                        </View>
                      ) : (
                        merchant.ofertas.map((offer) => {
                          const badge = getPromoBadge(offer.tipo_promocion);
                          const canAfford = userPoints >= (offer.puntos_requeridos || 0);

                          return (
                            <View key={offer.id} style={styles.offerCard}>
                              {/* Fila superior de la oferta: Tag de tipo y costo de puntos */}
                              <View style={styles.offerTopRow}>
                                <View style={[styles.promoTypeBadge, { backgroundColor: badge.bg }]}>
                                  <Text style={styles.promoTypeIcon}>{badge.icon}</Text>
                                  <Text style={[styles.promoTypeText, { color: badge.color }]}>
                                    {badge.label}
                                  </Text>
                                </View>
                                <View style={styles.pointsCostBadge}>
                                  <Text style={styles.pointsCostText}>
                                    ⭐ {offer.puntos_requeridos} pts
                                  </Text>
                                </View>
                              </View>

                              {/* Título de la Oferta */}
                              <Text style={styles.offerTitle}>{offer.nombre}</Text>

                              {/* Descripción de la Oferta */}
                              {offer.descripcion && offer.descripcion !== offer.nombre ? (
                                <Text style={styles.offerDesc}>{offer.descripcion}</Text>
                              ) : null}

                              {/* Pie de la oferta: Stock y Botón para Abrir Cupón QR */}
                              <View style={styles.offerBottomRow}>
                                <View style={styles.stockBadge}>
                                  <Text style={styles.stockBadgeText}>
                                    📦 {offer.stock} {offer.stock === 1 ? 'disponible' : 'disponibles'}
                                  </Text>
                                </View>

                                <TouchableOpacity
                                  style={styles.openCouponBtn}
                                  onPress={() => handleOpenCoupon(offer, merchant)}
                                  activeOpacity={0.85}
                                >
                                  <Text style={styles.openCouponBtnText}>🎫 Generar Cupón QR</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ─── MODAL ESTILO "CUPÓN DE RESTAURANTE" CON QR DINÁMICO ────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Modal
        visible={couponModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCouponModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.couponCard}>
            {/* Cabecera del Cupón */}
            <View style={styles.couponHeader}>
              <View style={styles.couponBadgeHeader}>
                <Text style={styles.couponBadgeHeaderText}>🎟️ CUPÓN DE DESCUENTO OFICIAL</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseCircle}
                onPress={() => setCouponModalVisible(false)}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.couponScrollBody}>
              {/* Información del Comercio y Oferta */}
              <View style={styles.couponMerchantBanner}>
                <Text style={styles.couponMerchantIcon}>
                  {selectedMerchant?.icono || '🏪'}
                </Text>
                <Text style={styles.couponMerchantName}>
                  {selectedMerchant?.nombre || selectedOffer?.comercio || 'Comercio Aliado'}
                </Text>
                <Text style={styles.couponMerchantAddress}>
                  📍 {selectedMerchant?.direccion || 'Palín, Escuintla'}
                </Text>
              </View>

              {/* TÍTULO DE LA OFERTA EN LETRAS GRANDES */}
              <View style={styles.couponOfferBox}>
                <Text style={styles.couponOfferTag}>BENEFICIO APLICABLE:</Text>
                <Text style={styles.couponOfferTitle}>
                  {selectedOffer?.nombre || 'Descuento Exclusivo'}
                </Text>

                {selectedOffer?.descripcion && selectedOffer.descripcion !== selectedOffer.nombre ? (
                  <Text style={styles.couponOfferDesc}>{selectedOffer.descripcion}</Text>
                ) : null}

                {/* PUNTOS REQUERIDOS DESTACADOS */}
                <View style={styles.couponPointsRequiredRow}>
                  <Text style={styles.couponPointsBig}>
                    ⭐ {selectedOffer?.puntos_requeridos || 50} PUNTOS
                  </Text>
                  <Text style={styles.couponPointsEquiv}>
                    (≈ Q{(((selectedOffer?.puntos_requeridos || 50) * 0.1)).toFixed(2)} de descuento directo)
                  </Text>
                </View>
              </View>

              {/* LÍNEA DE CORTE DE CUPÓN CON MUESCAS */}
              <View style={styles.cutLineContainer}>
                <View style={styles.cutNotchLeft} />
                <View style={styles.cutDashedLine} />
                <View style={styles.cutScissorsTag}>
                  <Text style={styles.cutScissorsText}>✂️ ESCANEAR EN CAJA ✂️</Text>
                </View>
                <View style={styles.cutNotchRight} />
              </View>

              {/* CONTENEDOR DEL CÓDIGO QR */}
              <View style={styles.couponQrWrapper}>
                <View style={styles.couponQrFrame}>
                  <Image
                    source={{ uri: couponQrUrl }}
                    style={styles.couponQrImage}
                    resizeMode="contain"
                  />
                </View>

                {/* CÓDIGO DE VECINO EN TEXTO GRANDE Y DESTACADO */}
                <View style={styles.couponCodeDisplay}>
                  <Text style={styles.couponCodeLabel}>CÓDIGO DE VECINO TITULAR:</Text>
                  <Text style={styles.couponCodeBigText}>{codigoVecino}</Text>
                  <Text style={styles.couponCodeHint}>
                    Presenta este código al cajero. Puede escanearlo o teclearlo.
                  </Text>
                </View>
              </View>

              {/* VALIDACIÓN DE SALDO ACTUAL DEL CLIENTE */}
              <View
                style={[
                  styles.userBalanceStatusBox,
                  userPoints >= (selectedOffer?.puntos_requeridos || 0)
                    ? styles.userBalanceOk
                    : styles.userBalanceWarning,
                ]}
              >
                {userPoints >= (selectedOffer?.puntos_requeridos || 0) ? (
                  <Text style={styles.userBalanceOkText}>
                    ✅ Tu saldo: {userPoints} pts • Tienes suficientes puntos para este beneficio
                  </Text>
                ) : (
                  <Text style={styles.userBalanceWarningText}>
                    ⚠️ Tu saldo: {userPoints} pts • Te faltan {(selectedOffer?.puntos_requeridos || 0) - userPoints} pts
                  </Text>
                )}
              </View>

              {/* Instrucción Final */}
              <Text style={styles.couponFooterInstruction}>
                Al presentar este cupón en caja, el comercio descontará los puntos correspondientes de tu billetera y aplicará la rebaja en tu factura.
              </Text>
            </ScrollView>

            {/* BOTÓN DE CIERRE DEL CUPÓN */}
            <View style={styles.couponModalActions}>
              <TouchableOpacity
                style={styles.couponCloseBtn}
                onPress={() => setCouponModalVisible(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.couponCloseBtnText}>Listo / Volver a Comercios</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topHeader: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tagPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
  },
  tagPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F766E',
    letterSpacing: 0.5,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  screenSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  pointsBadgeHeader: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    borderWidth: 1.5,
    borderColor: '#2DD4BF',
  },
  pointsBadgeIcon: {
    fontSize: 14,
  },
  pointsBadgeVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#2DD4BF',
  },
  pointsBadgeLbl: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
  },
  neighborCodeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 6,
  },
  neighborCodeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  neighborCodeValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0D9488',
    letterSpacing: 1,
  },
  categoryScroll: {
    marginTop: 8,
  },
  categoryScrollContent: {
    paddingVertical: 2,
    gap: 6,
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  catChipActive: {
    backgroundColor: '#0D9488',
    borderColor: '#0D9488',
  },
  catChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  catChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  // Tarjeta de Comercio
  merchantCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  merchantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#FFFFFF',
  },
  merchantIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F0FDFA',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  merchantIconText: {
    fontSize: 24,
  },
  merchantName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  merchantCategoryBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0D9488',
    marginTop: 1,
  },
  merchantAddress: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  merchantSchedule: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },
  accordionIndicator: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 8,
  },
  offersCountBadge: {
    backgroundColor: '#CCFBF1',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 4,
  },
  offersCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F766E',
  },
  accordionArrow: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '700',
  },
  // Subsección Ofertas
  offersContainer: {
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    padding: 12,
  },
  offersSectionHeader: {
    marginBottom: 10,
  },
  offersSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  noOffersBox: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  noOffersText: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
  },
  offerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    borderLeftColor: '#0D9488',
  },
  offerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  promoTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 4,
  },
  promoTypeIcon: {
    fontSize: 11,
  },
  promoTypeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  pointsCostBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  pointsCostText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
  },
  offerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  offerDesc: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 8,
    lineHeight: 16,
  },
  offerBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  stockBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  stockBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  openCouponBtn: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  openCouponBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  // ─── ESTILOS DEL MODAL CUPÓN DE RESTAURANTE ──────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  couponCard: {
    width: width - 32,
    maxHeight: '88%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 2,
    borderColor: '#0D9488',
  },
  couponHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  couponBadgeHeader: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  couponBadgeHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  modalCloseCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  couponScrollBody: {
    padding: 20,
    alignItems: 'center',
  },
  couponMerchantBanner: {
    alignItems: 'center',
    marginBottom: 12,
  },
  couponMerchantIcon: {
    fontSize: 36,
    marginBottom: 4,
  },
  couponMerchantName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  couponMerchantAddress: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
  },
  couponOfferBox: {
    width: '100%',
    backgroundColor: '#F0FDFA',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#99F6E4',
    marginBottom: 16,
  },
  couponOfferTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F766E',
    letterSpacing: 1,
    marginBottom: 4,
  },
  couponOfferTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 6,
  },
  couponOfferDesc: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 10,
  },
  couponPointsRequiredRow: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  couponPointsBig: {
    fontSize: 15,
    fontWeight: '900',
    color: '#B45309',
  },
  couponPointsEquiv: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
    marginTop: 2,
  },
  // Línea de Corte Estilo Cupón
  cutLineContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
    position: 'relative',
  },
  cutNotchLeft: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    marginLeft: -30,
  },
  cutNotchRight: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    marginRight: -30,
  },
  cutDashedLine: {
    flex: 1,
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cutScissorsTag: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    position: 'absolute',
    alignSelf: 'center',
  },
  cutScissorsText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  couponQrWrapper: {
    alignItems: 'center',
    width: '100%',
  },
  couponQrFrame: {
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#0D9488',
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 12,
  },
  couponQrImage: {
    width: 200,
    height: 200,
  },
  couponCodeDisplay: {
    width: '100%',
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  couponCodeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1,
  },
  couponCodeBigText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#2DD4BF',
    letterSpacing: 3,
    marginVertical: 2,
  },
  couponCodeHint: {
    fontSize: 10,
    color: '#CBD5E1',
    textAlign: 'center',
  },
  userBalanceStatusBox: {
    width: '100%',
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  userBalanceOk: {
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  userBalanceOkText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
    textAlign: 'center',
  },
  userBalanceWarning: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  userBalanceWarningText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
    textAlign: 'center',
  },
  couponFooterInstruction: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  couponModalActions: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  couponCloseBtn: {
    backgroundColor: '#0D9488',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  couponCloseBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
