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
  TextInput,
  Image,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../store/useAuthStore';
import { THEME } from '../../constants/theme';
import { getClientProfile } from '../../api/client';
import {
  createSubscriptionPayment,
  getSubscriptionPayments,
  getAffiliatedMerchants,
} from '../../api/financial';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ClientWalletScreen({ navigation }) {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);

  // Estados generales
  const [activeSegment, setActiveSegment] = useState('billetera'); // 'billetera' | 'comercios'
  const [userProfile, setUserProfile] = useState(profile);
  const [userPoints, setUserPoints] = useState(
    profile?.puntos_reciclaje ?? profile?.puntos_acumulados ?? 0
  );
  const [subscriptionPayments, setSubscriptionPayments] = useState([]);
  const [merchants, setMerchants] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('todos');

  // Estados de carga
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Estados del Modal de Pago
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('transferencia'); // 'transferencia' | 'tarjeta'
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Campos para Opción A: Transferencia Bancaria
  const [bankReference, setBankReference] = useState('');
  const [voucherUri, setVoucherUri] = useState(null);
  const [voucherBase64, setVoucherBase64] = useState(null);

  // Campos para Opción B: Pago en Línea (Tarjeta Simulada)
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState(profile?.nombre_completo || '');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');

  // ─── CARGA DE DATOS DESDE SUPABASE ──────────────────────────────────────────
  const loadData = useCallback(async (isPullToRefresh = false) => {
    if (isPullToRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      if (user?.id) {
        // 1. Refrescar datos del perfil (puntos y suscripción)
        const updatedProfile = await getClientProfile(user.id);
        if (updatedProfile) {
          setUserProfile(updatedProfile);
          setUserPoints(
            updatedProfile.puntos_reciclaje ?? updatedProfile.puntos_acumulados ?? 0
          );
        }

        // 2. Consultar historial de pagos en `pagos_suscripcion`
        const payments = await getSubscriptionPayments(user.id);
        setSubscriptionPayments(payments || []);
      }

      // 3. Consultar red de comercios afiliados
      const remoteMerchants = await getAffiliatedMerchants();
      setMerchants(remoteMerchants || []);
    } catch (err) {
      console.error('[ClientWallet] Error cargando datos financieros:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadData(true);
    });
    return unsubscribe;
  }, [navigation, loadData]);

  // ─── MANEJO DE IMÁGENES (EXPO-IMAGE-PICKER) ───────────────────────────────
  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permiso necesario',
          'Se requiere acceso a la galería para subir el comprobante de pago.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions?.Images || ['images'],
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setVoucherUri(asset.uri);
        setVoucherBase64(
          asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri
        );
      }
    } catch (err) {
      console.error('[ClientWallet] Error al seleccionar foto:', err);
      Alert.alert('Error', 'No se pudo abrir la galería: ' + err.message);
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permiso necesario',
          'Se requiere acceso a la cámara para fotografiar la boleta o comprobante bancario.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setVoucherUri(asset.uri);
        setVoucherBase64(
          asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri
        );
      }
    } catch (err) {
      console.error('[ClientWallet] Error al abrir cámara:', err);
      Alert.alert('Error', 'No se pudo acceder a la cámara: ' + err.message);
    }
  };

  // ─── FORMATEO DE TARJETA ──────────────────────────────────────────────────
  const handleCardNumberChange = (text) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 16);
    const parts = cleaned.match(/.{1,4}/g);
    setCardNumber(parts ? parts.join(' ') : cleaned);
  };

  const handleExpiryChange = (text) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 4);
    if (cleaned.length >= 3) {
      setCardExpiry(`${cleaned.slice(0, 2)}/${cleaned.slice(2)}`);
    } else {
      setCardExpiry(cleaned);
    }
  };

  const getCardType = () => {
    const num = cardNumber.replace(/\s/g, '');
    if (num.startsWith('4')) return 'Visa';
    if (/^(5[1-5]|2[2-7])/.test(num)) return 'Mastercard';
    if (/^3[47]/.test(num)) return 'Amex';
    return 'Bancaria';
  };

  // ─── PROCESAR PAGO DE SUSCRIPCIÓN ─────────────────────────────────────────
  const handleSubmitPayment = async () => {
    if (!user?.id) {
      Alert.alert('Error de Sesión', 'Debes tener una sesión activa para procesar el pago.');
      return;
    }

    // Validaciones según el método
    if (paymentMethod === 'transferencia') {
      if (!bankReference.trim()) {
        Alert.alert('Campo Requerido', 'Ingresa el número de referencia o boleta de la transferencia.');
        return;
      }
      if (!voucherUri) {
        Alert.alert(
          'Comprobante Requerido',
          'Por favor sube la foto del voucher o recibo bancario para respaldar tu pago.'
        );
        return;
      }
    } else if (paymentMethod === 'tarjeta') {
      const cleanNum = cardNumber.replace(/\s/g, '');
      if (cleanNum.length < 15) {
        Alert.alert('Tarjeta Inválida', 'Ingresa un número de tarjeta de crédito/débito válido de 16 dígitos.');
        return;
      }
      if (!cardHolder.trim()) {
        Alert.alert('Campo Requerido', 'Ingresa el nombre del titular de la tarjeta.');
        return;
      }
      if (cardExpiry.length < 5) {
        Alert.alert('Fecha Inválida', 'Ingresa la fecha de vencimiento en formato MM/AA.');
        return;
      }
      if (cardCvv.length < 3) {
        Alert.alert('CVV Inválido', 'Ingresa los 3 o 4 dígitos de seguridad (CVV).');
        return;
      }
    }

    setIsSubmittingPayment(true);

    try {
      const cleanNum = cardNumber.replace(/\s/g, '');
      const maskedCard = cleanNum ? `•••• •••• •••• ${cleanNum.slice(-4)}` : null;

      const paymentRecord = await createSubscriptionPayment({
        userId: user.id,
        monto: 30.0, // Tarifa oficial de suscripción EcoRuta mensual
        metodoPago: paymentMethod,
        comprobanteUrl: voucherBase64 || voucherUri || null,
        noReferencia: bankReference.trim() || `TDC-${Date.now().toString().slice(-6)}`,
        detalles: {
          periodo: 'Noviembre 2026',
          tarjetaEnmascarada: maskedCard,
          tipoTarjeta: paymentMethod === 'tarjeta' ? getCardType() : null,
          bancoEmisor: paymentMethod === 'transferencia' ? 'Transferencia Bancaria' : 'Pasarela en Línea',
        },
      });

      // Recargar historial inmediatamente
      await loadData(true);

      // Limpiar formulario y cerrar modal
      setPaymentModalVisible(false);
      setBankReference('');
      setVoucherUri(null);
      setVoucherBase64(null);
      setCardNumber('');
      setCardExpiry('');
      setCardCvv('');

      Alert.alert(
        '✅ Pago Registrado con Éxito',
        `Tu pago por Q30.00 ha sido registrado en Supabase con estado 'pendiente'.\n\nNo. de Transacción: ${
          paymentRecord.no_referencia || 'Generado'
        }\n\nGestión EcoRuta validará tu comprobante en breve para mantener tu suscripción al día.`
      );
    } catch (err) {
      console.error('[ClientWallet] Error guardando pago:', err);
      Alert.alert(
        'Error al registrar pago',
        err.message || 'No se pudo registrar la transacción en la base de datos de Supabase.'
      );
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // ─── DETERMINAR ESTADO DE SUSCRIPCIÓN ──────────────────────────────────────
  const rawStatus = (userProfile?.estado_suscripcion || '').toLowerCase();
  const isSubscriptionActive =
    rawStatus === 'activa' || rawStatus === 'activo' || rawStatus === 'al dia' || rawStatus === 'al día' || (!rawStatus && userProfile?.activo !== false);

  const getStatusBadge = () => {
    if (isSubscriptionActive) {
      return {
        label: '🟢 Suscripción Activa — Al Día',
        color: '#065F46',
        bg: '#D1FAE5',
        border: '#A7F3D0',
        desc: 'Tu servicio de recolección EcoRuta está cubierto para el mes en curso.',
      };
    }
    if (rawStatus === 'pendiente' || rawStatus === 'en revision') {
      return {
        label: '🟡 Pago en Validación',
        color: '#92400E',
        bg: '#FEF3C7',
        border: '#FDE68A',
        desc: 'Tu comprobante de pago está siendo verificado por Gestión EcoRuta.',
      };
    }
    return {
      label: '🔴 Cuota Pendiente de Pago',
      color: '#991B1B',
      bg: '#FEE2E2',
      border: '#FECACA',
      desc: 'Realiza el pago de tu cuota mensual para evitar la suspensión del servicio.',
    };
  };

  const statusBadge = getStatusBadge();

  // Filtrado de comercios
  const categories = ['todos', 'Abarrotes', 'Hogar', 'Cafetería', 'Salud', 'Automotriz'];
  const filteredMerchants =
    selectedCategory === 'todos'
      ? merchants
      : merchants.filter((m) =>
          (m.categoria || '').toLowerCase().includes(selectedCategory.toLowerCase())
        );

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* ── BARRA SUPERIOR INSTITUCIONAL ───────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>💳 Módulo Financiero</Text>
          <View style={styles.ecoRutaBadge}>
            <Text style={styles.ecoRutaBadgeText}>EcoRuta • Palín</Text>
          </View>
        </View>
        <Text style={styles.headerSubtitle}>
          Gestión de eco-puntos, pago de suscripción y comercios aliados
        </Text>

        {/* SELECTOR DE PESTAÑAS / SEGMENTOS */}
        <View style={styles.segmentContainer}>
          <TouchableOpacity
            style={[styles.segmentBtn, activeSegment === 'billetera' && styles.segmentBtnActive]}
            onPress={() => setActiveSegment('billetera')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.segmentBtnText,
                activeSegment === 'billetera' && styles.segmentBtnTextActive,
              ]}
            >
              💳 Mi Billetera & Pagos
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, activeSegment === 'comercios' && styles.segmentBtnActive]}
            onPress={() => setActiveSegment('comercios')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.segmentBtnText,
                activeSegment === 'comercios' && styles.segmentBtnTextActive,
              ]}
            >
              🏪 Comercios Afiliados
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={THEME.colors.primary} />
          <Text style={styles.loadingText}>Cargando billetera y suscripción...</Text>
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
          {activeSegment === 'billetera' ? (
            <>
              {/* ── 1. TARJETA DIGITAL DE ECO-BILLETERA ─────────────────────── */}
              <View style={styles.walletHeroCard}>
                <View style={styles.walletCardBackgroundDecor} />
                <View style={styles.walletHeaderRow}>
                  <View style={styles.walletLogoGroup}>
                    <Text style={styles.walletCardLogo}>🌿</Text>
                    <View>
                      <Text style={styles.walletCardTitle}>EcoRuta Palín</Text>
                      <Text style={styles.walletCardSub}>Billetera Ecológica Ciudadana</Text>
                    </View>
                  </View>
                  <View style={styles.cardChip}>
                    <View style={styles.cardChipLine} />
                  </View>
                </View>

                <View style={styles.walletBalanceBlock}>
                  <Text style={styles.walletBalanceLabel}>SALDO DISPONIBLE</Text>
                  <View style={styles.walletBalanceValueRow}>
                    <Text style={styles.walletBalancePoints}>{userPoints}</Text>
                    <Text style={styles.walletBalanceSuffix}>pts</Text>
                  </View>
                  <Text style={styles.walletEquivalentText}>
                    ≈ Equivalente a Q{(userPoints * 0.1).toFixed(2)} en descuentos locales
                  </Text>
                </View>

                <View style={styles.walletFooterRow}>
                  <View>
                    <Text style={styles.walletOwnerLabel}>TITULAR DEL INMUEBLE</Text>
                    <Text style={styles.walletOwnerName}>
                      {userProfile?.nombre_completo || 'Vecino de Palín'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.redeemQuickBtn}
                    onPress={() => setActiveSegment('comercios')}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.redeemQuickBtnText}>Canjear ⭐</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* ── 2. TARJETA DE ESTADO DE SUSCRIPCIÓN ECORUTA ───────────── */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionCardHeader}>
                  <Text style={styles.sectionTitle}>📋 Estado de Suscripción</Text>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: statusBadge.bg, borderColor: statusBadge.border },
                    ]}
                  >
                    <Text style={[styles.statusPillText, { color: statusBadge.color }]}>
                      {statusBadge.label}
                    </Text>
                  </View>
                </View>

                <Text style={styles.statusDescription}>{statusBadge.desc}</Text>

                <View style={styles.subscriptionDetailsBox}>
                  <View style={styles.subDetailRow}>
                    <Text style={styles.subDetailKey}>Cuota Mensual:</Text>
                    <Text style={styles.subDetailVal}>Q30.00 / mes</Text>
                  </View>
                  <View style={styles.subDetailRow}>
                    <Text style={styles.subDetailKey}>Inmueble:</Text>
                    <Text style={styles.subDetailVal}>
                      {userProfile?.direccion || 'Palín, Escuintla'}
                    </Text>
                  </View>
                  <View style={styles.subDetailRow}>
                    <Text style={styles.subDetailKey}>Sector Asignado:</Text>
                    <Text style={styles.subDetailVal}>
                      {userProfile?.ruta_asignada || 'Casco Urbano • Cuadrante Central'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.payFeeBtn}
                  onPress={() => setPaymentModalVisible(true)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.payFeeBtnIcon}>💳</Text>
                  <Text style={styles.payFeeBtnText}>Pagar Cuota de Suscripción (Q30.00)</Text>
                </TouchableOpacity>
              </View>

              {/* ── 3. HISTORIAL DE PAGOS DE SUSCRIPCIÓN ─────────────────────── */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>🧾 Historial de Pagos de Cuota</Text>
                <Text style={styles.sectionSubtitle}>
                  Registro de pagos procesados mediante transferencia bancaria y tarjeta en línea
                </Text>

                {subscriptionPayments.length === 0 ? (
                  <View style={styles.emptyPaymentsBox}>
                    <Text style={styles.emptyPaymentsIcon}>📄</Text>
                    <Text style={styles.emptyPaymentsTitle}>Sin pagos registrados</Text>
                    <Text style={styles.emptyPaymentsDesc}>
                      Tus transacciones de pago de cuota EcoRuta aparecerán aquí.
                    </Text>
                  </View>
                ) : (
                  subscriptionPayments.map((p) => {
                    const isCard = p.metodo_pago === 'tarjeta';
                    const isPending = p.estado === 'pendiente';
                    const isApproved = p.estado === 'aprobado';

                    return (
                      <View key={p.id?.toString()} style={styles.paymentItemCard}>
                        <View style={styles.paymentItemTop}>
                          <View style={styles.paymentMethodBadge}>
                            <Text style={styles.paymentMethodIcon}>{isCard ? '💳' : '🏛️'}</Text>
                            <Text style={styles.paymentMethodName}>
                              {isCard ? 'Pago en Línea' : 'Transferencia'}
                            </Text>
                          </View>
                          <Text style={styles.paymentItemAmount}>
                            Q{parseFloat(p.monto || 30).toFixed(2)}
                          </Text>
                        </View>

                        <View style={styles.paymentItemBottom}>
                          <View>
                            <Text style={styles.paymentItemRef}>
                              Ref: {p.no_referencia || 'N/A'}
                            </Text>
                            <Text style={styles.paymentItemDate}>
                              📅{' '}
                              {p.fecha_pago
                                ? new Date(p.fecha_pago).toLocaleDateString('es-GT', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                  })
                                : 'Fecha reciente'}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.paymentStatusBadge,
                              isPending && styles.paymentStatusPending,
                              isApproved && styles.paymentStatusApproved,
                            ]}
                          >
                            <Text
                              style={[
                                styles.paymentStatusText,
                                isPending && styles.paymentStatusTextPending,
                                isApproved && styles.paymentStatusTextApproved,
                              ]}
                            >
                              {isPending ? '⏳ Pendiente' : isApproved ? '✅ Aprobado' : '🔴 ' + p.estado}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </>
          ) : (
            /* ── PESTAÑA: COMERCIOS AFILIADOS ─────────────────────────────── */
            <View>
              {/* Resumen de puntos para canje */}
              <View style={styles.merchantsPointsBanner}>
                <View>
                  <Text style={styles.merchantBannerLabel}>SALDO DE CANJE</Text>
                  <Text style={styles.merchantBannerPoints}>{userPoints} Eco-Puntos</Text>
                </View>
                <Text style={styles.merchantBannerHint}>
                  Visita los establecimientos de Palín y presenta tu app para aplicar tus descuentos.
                </Text>
              </View>

              {/* Filtros de categoría */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                {categories.map((cat) => {
                  const isSelected = selectedCategory === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.filterChip, isSelected && styles.filterChipActive]}
                      onPress={() => setSelectedCategory(cat)}
                    >
                      <Text
                        style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}
                      >
                        {cat === 'todos' ? '🌟 Todos' : cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Lista de comercios */}
              <View style={styles.merchantsList}>
                {filteredMerchants.length === 0 ? (
                  <View style={styles.emptyPaymentsBox}>
                    <Text style={styles.emptyPaymentsIcon}>🏪</Text>
                    <Text style={styles.emptyPaymentsTitle}>No hay comercios en esta categoría</Text>
                    <Text style={styles.emptyPaymentsDesc}>
                      Pronto se sumarán más establecimientos comerciales en Palín.
                    </Text>
                  </View>
                ) : (
                  filteredMerchants.map((m) => {
                    const canAfford = userPoints >= (m.puntos_requeridos || 0);

                    return (
                      <View key={m.id?.toString()} style={styles.merchantCard}>
                        <View style={styles.merchantCardTop}>
                          <View style={styles.merchantIconCircle}>
                            <Text style={styles.merchantIcon}>{m.icono || '🏪'}</Text>
                          </View>
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.merchantName}>{m.nombre}</Text>
                            <Text style={styles.merchantCategory}>{m.categoria}</Text>
                          </View>
                          <View style={styles.merchantPointsRequiredBadge}>
                            <Text style={styles.merchantPointsRequiredText}>
                              ⭐ {m.puntos_requeridos || 50} pts
                            </Text>
                          </View>
                        </View>

                        {/* Banner del descuento */}
                        <View style={styles.discountBanner}>
                          <Text style={styles.discountTag}>🏷️ BENEFICIO EXCLUSIVO:</Text>
                          <Text style={styles.discountTitle}>{m.descuento}</Text>
                        </View>

                        {/* Detalles de contacto y ubicación */}
                        <View style={styles.merchantMetaRow}>
                          <Text style={styles.merchantMetaText}>📍 {m.direccion}</Text>
                        </View>
                        {m.horario ? (
                          <View style={styles.merchantMetaRow}>
                            <Text style={styles.merchantMetaText}>🕒 {m.horario}</Text>
                          </View>
                        ) : null}

                        {/* Botón de acción */}
                        <TouchableOpacity
                          style={[
                            styles.merchantRedeemBtn,
                            !canAfford && styles.merchantRedeemBtnDisabled,
                          ]}
                          onPress={() => {
                            if (!canAfford) {
                              Alert.alert(
                                'Puntos Insuficientes',
                                `Necesitas ${m.puntos_requeridos} pts para canjear este beneficio en ${m.nombre}. Tienes ${userPoints} pts.`
                              );
                              return;
                            }
                            Alert.alert(
                              '🎉 Beneficio en Comercio',
                              `Acércate a "${m.nombre}" en ${m.direccion} y presenta tu Eco-Pase con tu QR o comprobante de ${m.puntos_requeridos} eco-puntos para reclamar: "${m.descuento}".`
                            );
                          }}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.merchantRedeemBtnText,
                              !canAfford && styles.merchantRedeemBtnTextDisabled,
                            ]}
                          >
                            {canAfford ? 'Reclamar en el Comercio 🏪' : `Faltan ${(m.puntos_requeridos || 0) - userPoints} pts`}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── MODAL DE PAGO DE SUSCRIPCIÓN (OPCIÓN A Y B) ───────────────────────── */}
      <Modal visible={paymentModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalTitle}>Pagar Cuota de Recolección</Text>
                <Text style={styles.modalSubtitle}>Servicio Privado de Recolección EcoRuta • Palín</Text>
              </View>
              <TouchableOpacity
                onPress={() => setPaymentModalVisible(false)}
                style={styles.modalCloseCircle}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Total a pagar */}
            <View style={styles.amountBanner}>
              <Text style={styles.amountLabel}>MONTO A PAGAR</Text>
              <Text style={styles.amountValue}>Q30.00</Text>
              <Text style={styles.amountPeriod}>Periodo: Noviembre 2026</Text>
            </View>

            {/* Selector de Método: Transferencia vs Tarjeta en Línea */}
            <View style={styles.paymentMethodToggleRow}>
              <TouchableOpacity
                style={[
                  styles.methodToggleBtn,
                  paymentMethod === 'transferencia' && styles.methodToggleBtnActive,
                ]}
                onPress={() => setPaymentMethod('transferencia')}
                activeOpacity={0.8}
              >
                <Text style={styles.methodToggleIcon}>🏛️</Text>
                <Text
                  style={[
                    styles.methodToggleText,
                    paymentMethod === 'transferencia' && styles.methodToggleTextActive,
                  ]}
                >
                  Opción A: Transferencia
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.methodToggleBtn,
                  paymentMethod === 'tarjeta' && styles.methodToggleBtnActive,
                ]}
                onPress={() => setPaymentMethod('tarjeta')}
                activeOpacity={0.8}
              >
                <Text style={styles.methodToggleIcon}>💳</Text>
                <Text
                  style={[
                    styles.methodToggleText,
                    paymentMethod === 'tarjeta' && styles.methodToggleTextActive,
                  ]}
                >
                  Opción B: Tarjeta en Línea
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              {paymentMethod === 'transferencia' ? (
                /* ── OPCIÓN A: TRANSFERENCIA BANCARIA (CON EXPO-IMAGE-PICKER) ── */
                <View style={styles.transferSection}>
                  <Text style={styles.formSectionTitle}>Cuentas Bancarias Oficiales EcoRuta</Text>
                  <View style={styles.bankAccountsCard}>
                    <Text style={styles.bankName}>• Banco Industrial (Monetaria):</Text>
                    <Text style={styles.bankNumber}>021-004589-2</Text>
                    <Text style={styles.bankBeneficiary}>
                      A nombre de: EcoRuta - Gestión y Reciclaje
                    </Text>

                    <View style={styles.bankDivider} />

                    <Text style={styles.bankName}>• Banrural (Monetaria):</Text>
                    <Text style={styles.bankNumber}>314-001289-5</Text>
                    <Text style={styles.bankBeneficiary}>
                      A nombre de: EcoRuta - Servicio Privado de Recolección
                    </Text>
                  </View>

                  <Text style={styles.inputLabel}>No. de Boleta / Referencia Bancaria *</Text>
                  <TextInput
                    style={styles.modalTextInput}
                    placeholder="Ej. BI-8945201 o 45892"
                    value={bankReference}
                    onChangeText={setBankReference}
                    placeholderTextColor="#94A3B8"
                  />

                  <Text style={styles.inputLabel}>Foto del Voucher o Comprobante *</Text>

                  {voucherUri ? (
                    <View style={styles.voucherPreviewContainer}>
                      <Image source={{ uri: voucherUri }} style={styles.voucherPreviewImage} />
                      <View style={styles.voucherOverlayActions}>
                        <Text style={styles.voucherSuccessTag}>✅ Voucher adjunto</Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                          <TouchableOpacity
                            style={styles.voucherChangeBtn}
                            onPress={handlePickImage}
                          >
                            <Text style={styles.voucherChangeText}>Cambiar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.voucherRemoveBtn}
                            onPress={() => {
                              setVoucherUri(null);
                              setVoucherBase64(null);
                            }}
                          >
                            <Text style={styles.voucherRemoveText}>Eliminar</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.uploadVoucherBox}>
                      <Text style={styles.uploadIcon}>📷</Text>
                      <Text style={styles.uploadTitle}>Adjunta la foto de tu comprobante</Text>
                      <Text style={styles.uploadSub}>
                        Usa la cámara de tu móvil o selecciona una captura desde tu galería
                      </Text>

                      <View style={styles.uploadBtnRow}>
                        <TouchableOpacity style={styles.uploadActionBtn} onPress={handlePickImage}>
                          <Text style={styles.uploadActionBtnText}>🖼️ Abrir Galería</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.uploadActionBtn} onPress={handleTakePhoto}>
                          <Text style={styles.uploadActionBtnText}>📸 Tomar Foto</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              ) : (
                /* ── OPCIÓN B: PAGO EN LÍNEA (PASARELA SIMULADA DE TARJETAS) ── */
                <View style={styles.onlineCardSection}>
                  {/* Tarjeta Virtual Interactiva */}
                  <View style={styles.virtualCard}>
                    <View style={styles.virtualCardTop}>
                      <View style={styles.virtualChip} />
                      <Text style={styles.virtualCardType}>{getCardType()}</Text>
                    </View>

                    <Text style={styles.virtualCardNumber}>
                      {cardNumber || '•••• •••• •••• ••••'}
                    </Text>

                    <View style={styles.virtualCardBottom}>
                      <View>
                        <Text style={styles.virtualCardLabel}>TITULAR</Text>
                        <Text style={styles.virtualCardHolder}>
                          {(cardHolder || 'NOMBRE TITULAR').toUpperCase()}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.virtualCardLabel}>VENCE</Text>
                        <Text style={styles.virtualCardExpiry}>{cardExpiry || 'MM/AA'}</Text>
                      </View>
                    </View>
                  </View>

                  <Text style={styles.inputLabel}>Número de Tarjeta (16 dígitos) *</Text>
                  <TextInput
                    style={styles.modalTextInput}
                    placeholder="4000 1234 5678 9010"
                    keyboardType="numeric"
                    maxLength={19}
                    value={cardNumber}
                    onChangeText={handleCardNumberChange}
                    placeholderTextColor="#94A3B8"
                  />

                  <Text style={styles.inputLabel}>Nombre del Titular *</Text>
                  <TextInput
                    style={styles.modalTextInput}
                    placeholder="Como aparece en la tarjeta"
                    value={cardHolder}
                    onChangeText={setCardHolder}
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="characters"
                  />

                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>Expiración (MM/AA) *</Text>
                      <TextInput
                        style={styles.modalTextInput}
                        placeholder="12/28"
                        keyboardType="numeric"
                        maxLength={5}
                        value={cardExpiry}
                        onChangeText={handleExpiryChange}
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>CVV / CVC *</Text>
                      <TextInput
                        style={styles.modalTextInput}
                        placeholder="123"
                        keyboardType="numeric"
                        maxLength={4}
                        secureTextEntry
                        value={cardCvv}
                        onChangeText={setCardCvv}
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                  </View>

                  <View style={styles.securityBadgeRow}>
                    <Text style={styles.securityBadgeIcon}>🔒</Text>
                    <Text style={styles.securityBadgeText}>
                      Pasarela Segura EcoRuta • Cifrado TLS 256-bit
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* BOTÓN DE CONFIRMAR PAGO */}
            <TouchableOpacity
              style={[styles.submitPaymentBtn, isSubmittingPayment && styles.submitPaymentBtnDisabled]}
              onPress={handleSubmitPayment}
              disabled={isSubmittingPayment}
              activeOpacity={0.85}
            >
              {isSubmittingPayment ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.submitPaymentBtnText}>Guardando transacción en Supabase...</Text>
                </View>
              ) : (
                <Text style={styles.submitPaymentBtnText}>
                  {paymentMethod === 'transferencia'
                    ? 'Enviar Comprobante a EcoRuta 📤'
                    : 'Pagar Q30.00 con Tarjeta 🔒'}
                </Text>
              )}
            </TouchableOpacity>
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
    ...(Platform.OS === 'web' && {
      maxWidth: 900,
      width: '100%',
      alignSelf: 'center',
    }),
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  ecoRutaBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  ecoRutaBadgeText: {
    fontSize: 11,
    color: '#065F46',
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
    marginBottom: 12,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 10,
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  segmentBtnTextActive: {
    color: '#065F46',
    fontWeight: '800',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    ...(Platform.OS === 'web' && {
      maxWidth: 900,
      width: '100%',
      alignSelf: 'center',
    }),
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 10,
    fontWeight: '600',
  },
  // Billetera Hero Card
  walletHeroCard: {
    backgroundColor: '#064E3B', // Esmeralda bosque oscuro
    borderRadius: 22,
    padding: 22,
    marginBottom: 20,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  walletCardBackgroundDecor: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
  },
  walletHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  walletLogoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  walletCardLogo: {
    fontSize: 24,
  },
  walletCardTitle: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  walletCardSub: {
    color: '#6EE7B7',
    fontSize: 11,
    fontWeight: '600',
  },
  cardChip: {
    width: 36,
    height: 26,
    backgroundColor: '#FDE68A',
    borderRadius: 6,
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  cardChipLine: {
    height: 1,
    backgroundColor: '#B45309',
  },
  walletBalanceBlock: {
    marginVertical: 18,
  },
  walletBalanceLabel: {
    color: '#A7F3D0',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  walletBalanceValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
  },
  walletBalancePoints: {
    fontSize: 42,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  walletBalanceSuffix: {
    fontSize: 20,
    fontWeight: '800',
    color: '#34D399',
    marginLeft: 6,
  },
  walletEquivalentText: {
    color: '#D1FAE5',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  walletFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
    paddingTop: 14,
  },
  walletOwnerLabel: {
    color: '#6EE7B7',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  walletOwnerName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  redeemQuickBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  redeemQuickBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  // Secciones
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginBottom: 14,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  statusDescription: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
    marginBottom: 14,
  },
  subscriptionDetailsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginBottom: 16,
  },
  subDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  subDetailKey: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
  },
  subDetailVal: {
    fontSize: 12,
    color: THEME.colors.textPrimary,
    fontWeight: '700',
  },
  payFeeBtn: {
    backgroundColor: THEME.colors.primaryDark,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: THEME.colors.primaryDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  payFeeBtnIcon: {
    fontSize: 16,
  },
  payFeeBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  // Pagos
  emptyPaymentsBox: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyPaymentsIcon: {
    fontSize: 36,
    marginBottom: 6,
  },
  emptyPaymentsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  emptyPaymentsDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  paymentItemCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  paymentItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  paymentMethodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paymentMethodIcon: {
    fontSize: 15,
  },
  paymentMethodName: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  paymentItemAmount: {
    fontSize: 15,
    fontWeight: '900',
    color: '#065F46',
  },
  paymentItemBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
  },
  paymentItemRef: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  paymentItemDate: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    marginTop: 1,
  },
  paymentStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
  },
  paymentStatusPending: {
    backgroundColor: '#FEF3C7',
  },
  paymentStatusApproved: {
    backgroundColor: '#D1FAE5',
  },
  paymentStatusText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  paymentStatusTextPending: {
    color: '#92400E',
  },
  paymentStatusTextApproved: {
    color: '#065F46',
  },
  // Comercios
  merchantsPointsBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  merchantBannerLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
  },
  merchantBannerPoints: {
    fontSize: 22,
    fontWeight: '900',
    color: '#92400E',
    marginTop: 2,
  },
  merchantBannerHint: {
    fontSize: 12,
    color: '#78350F',
    marginTop: 4,
    lineHeight: 16,
  },
  filterScroll: {
    marginBottom: 16,
  },
  filterChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#065F46',
    borderColor: '#065F46',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  merchantsList: {
    gap: 14,
  },
  merchantCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  merchantCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  merchantIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  merchantIcon: {
    fontSize: 22,
  },
  merchantName: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  merchantCategory: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
  },
  merchantPointsRequiredBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  merchantPointsRequiredText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#065F46',
  },
  discountBanner: {
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  discountTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
    marginBottom: 2,
  },
  discountTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#065F46',
  },
  merchantMetaRow: {
    marginBottom: 4,
  },
  merchantMetaText: {
    fontSize: 11,
    color: '#64748B',
  },
  merchantRedeemBtn: {
    backgroundColor: THEME.colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  merchantRedeemBtnDisabled: {
    backgroundColor: '#E2E8F0',
  },
  merchantRedeemBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  merchantRedeemBtnTextDisabled: {
    color: '#94A3B8',
  },
  // Modal de Pago
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
    ...(Platform.OS === 'web' && {
      maxWidth: 600,
      width: '100%',
      alignSelf: 'center',
      borderRadius: 24,
      marginBottom: 30,
    }),
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#CBD5E1',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
  },
  modalCloseCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  amountBanner: {
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 14,
  },
  amountLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.8,
  },
  amountValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#064E3B',
    marginTop: 2,
  },
  amountPeriod: {
    fontSize: 11,
    color: '#047857',
    fontWeight: '600',
    marginTop: 2,
  },
  paymentMethodToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  methodToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    backgroundColor: '#F8FAFC',
  },
  methodToggleBtnActive: {
    borderColor: THEME.colors.primaryDark,
    backgroundColor: '#ECFDF5',
  },
  methodToggleIcon: {
    fontSize: 14,
  },
  methodToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  methodToggleTextActive: {
    color: '#065F46',
    fontWeight: '800',
  },
  formSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 8,
  },
  bankAccountsCard: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  bankName: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  bankNumber: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1E3A8A',
    letterSpacing: 0.5,
    marginVertical: 2,
  },
  bankBeneficiary: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
  },
  bankDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 10,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 6,
    marginTop: 8,
  },
  modalTextInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: THEME.colors.textPrimary,
  },
  uploadVoucherBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  uploadIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  uploadTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  uploadSub: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 12,
  },
  uploadBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  uploadActionBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  uploadActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  voucherPreviewContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
    padding: 8,
    marginTop: 4,
  },
  voucherPreviewImage: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  voucherOverlayActions: {
    marginTop: 8,
    alignItems: 'center',
  },
  voucherSuccessTag: {
    fontSize: 12,
    fontWeight: '800',
    color: '#065F46',
  },
  voucherChangeBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  voucherChangeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  voucherRemoveBtn: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  voucherRemoveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#991B1B',
  },
  // Tarjeta Virtual
  virtualCard: {
    backgroundColor: '#0F172A', // Slate oscuro elegante
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  virtualCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  virtualChip: {
    width: 32,
    height: 24,
    backgroundColor: '#FDE68A',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#D97706',
  },
  virtualCardType: {
    fontSize: 13,
    fontWeight: '900',
    color: '#38BDF8',
    letterSpacing: 1,
  },
  virtualCardNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 2,
    marginBottom: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  virtualCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  virtualCardLabel: {
    fontSize: 9,
    color: '#94A3B8',
    fontWeight: '800',
  },
  virtualCardHolder: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 1,
  },
  virtualCardExpiry: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 1,
  },
  securityBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
  },
  securityBadgeIcon: {
    fontSize: 12,
  },
  securityBadgeText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  submitPaymentBtn: {
    backgroundColor: THEME.colors.primaryDark,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
    shadowColor: THEME.colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitPaymentBtnDisabled: {
    opacity: 0.7,
  },
  submitPaymentBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});
