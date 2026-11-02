import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Vibration,
  Platform,
  Dimensions,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../store/useAuthStore';
import { THEME } from '../../constants/theme';
import { getCitizenVerification, reportFraudLog } from '../../api/collections';
import {
  processAffiliateDiscount,
  getAffiliateSettlementData,
  recordAffiliateCommissionPayment,
  getAffiliateOffers,
  proposeAffiliateOffer,
  respondToOfferCounterProposal,
} from '../../api/affiliate';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function AffiliateHomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const logout = useAuthStore((state) => state.logout);

  // Pestaña activa
  const [activeTab, setActiveTab] = useState('caja'); // 'caja' | 'ofertas' | 'liquidacion' | 'historial'

  // Permisos de cámara
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scannedCitizenId, setScannedCitizenId] = useState('');
  const [manualCode, setManualCode] = useState('');

  // Estados de Verificación Antifraude
  const [isValidatingCitizen, setIsValidatingCitizen] = useState(false);
  const [verificationModalVisible, setVerificationModalVisible] = useState(false);
  const [citizenData, setCitizenData] = useState(null);

  // Estados del Formulario de Descuento
  const [discountModalVisible, setDiscountModalVisible] = useState(false);
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [pointsToRedeem, setPointsToRedeem] = useState('');
  const [ticketNo, setTicketNo] = useState('');
  const [isProcessingDiscount, setIsProcessingDiscount] = useState(false);

  // Estados de Liquidación
  const [settlementData, setSettlementData] = useState({
    totalPendiente: 0,
    totalPuntos: 0,
    canjesPendientes: [],
    canjesLiquidados: [],
  });
  const [isLoadingSettlement, setIsLoadingSettlement] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Estados para Pasarela de Pago B2B (Pagar Saldo a EcoRuta)
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('transferencia'); // 'transferencia' | 'tarjeta'
  const [bankReference, setBankReference] = useState('');
  const [voucherUri, setVoucherUri] = useState(null);
  const [voucherBase64, setVoucherBase64] = useState(null);
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // ─── GESTIÓN DE COMPROBANTE BANCARIO (IMAGE PICKER) ───────────────────────
  const handlePickVoucher = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permiso necesario',
          'Se requiere acceso a la galería para seleccionar la boleta de pago bancario.'
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
      console.error('[AffiliateHome] Error al seleccionar foto:', err);
      Alert.alert('Error', 'No se pudo abrir la galería: ' + err.message);
    }
  };

  const handleTakeVoucherPhoto = async () => {
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
      console.error('[AffiliateHome] Error al abrir cámara:', err);
      Alert.alert('Error', 'No se pudo acceder a la cámara: ' + err.message);
    }
  };

  // ─── FORMATEO DE TARJETA VIRTUAL ──────────────────────────────────────────
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

  // ─── PROCESAR PAGO B2B DE COMISIONES CPA A ECORUTA ─────────────────────────
  const handleSubmitB2BPayment = async () => {
    if (!user?.id) {
      Alert.alert('Error de Sesión', 'Debes tener una sesión activa para procesar el pago.');
      return;
    }

    if (settlementData.totalPendiente <= 0) {
      Alert.alert('Sin Saldo Pendiente', 'No tienes comisiones pendientes que liquidar.');
      return;
    }

    // Validaciones
    if (paymentMethod === 'transferencia') {
      if (!bankReference.trim()) {
        Alert.alert('Campo Requerido', 'Ingresa el número de boleta o referencia bancaria.');
        return;
      }
      if (!voucherUri) {
        Alert.alert(
          'Comprobante Requerido',
          'Por favor sube la foto del voucher o recibo bancario para respaldar tu depósito.'
        );
        return;
      }
    } else if (paymentMethod === 'tarjeta') {
      const cleanNum = cardNumber.replace(/\s/g, '');
      if (cleanNum.length < 15) {
        Alert.alert('Tarjeta Inválida', 'Ingresa un número de tarjeta válido de 16 dígitos.');
        return;
      }
      if (!cardHolder.trim()) {
        Alert.alert('Campo Requerido', 'Ingresa el nombre del titular de la tarjeta.');
        return;
      }
      if (cardExpiry.length < 5) {
        Alert.alert('Fecha Inválida', 'Ingresa la fecha de expiración en formato MM/AA.');
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
      const pendingIds = settlementData.canjesPendientes.map((c) => c.id).filter(Boolean);

      const res = await recordAffiliateCommissionPayment({
        affiliateId: user.id,
        affiliateName: profile?.nombre_completo || profile?.comercio_nombre || 'Comercio Afiliado',
        amount: settlementData.totalPendiente,
        paymentMethod,
        receiptNo: bankReference.trim() || `TDC-${Date.now().toString().slice(-6)}`,
        voucherUrl: voucherBase64 || voucherUri || null,
        pendingCanjeIds: pendingIds,
        details: {
          periodo: 'Noviembre 2026',
          tarjetaEnmascarada: maskedCard,
          tipoTarjeta: paymentMethod === 'tarjeta' ? getCardType() : null,
          bancoEmisor: paymentMethod === 'transferencia' ? 'Transferencia Bancaria' : 'Pasarela B2B en Línea',
        },
      });

      // Recargar estado de cuenta inmediatamente
      await loadSettlement(true);

      // Limpiar formulario y cerrar modal
      setPaymentModalVisible(false);
      setBankReference('');
      setVoucherUri(null);
      setVoucherBase64(null);
      setCardNumber('');
      setCardExpiry('');
      setCardCvv('');

      Alert.alert(
        '✅ Pago B2B Registrado con Éxito',
        `Se registró tu pago por Q${settlementData.totalPendiente.toFixed(2)} en la tabla 'pagos_comercios'.\n\n• Concepto: pago_comisiones_cpa\n• No. de Referencia: ${
          res.payment?.no_referencia || 'Generado'
        }\n• Canjes liquidados: ${res.updatedCanjes || pendingIds.length}\n\nTu estado de cuenta ha quedado al día en EcoRuta.`
      );
    } catch (err) {
      console.error('[AffiliateHome] Error registrando pago B2B:', err);
      Alert.alert(
        'Error al procesar pago',
        err.message || 'No se pudo registrar la transacción en la base de datos de Supabase.'
      );
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Cargar datos de liquidación
  const loadSettlement = useCallback(async (isPullToRefresh = false) => {
    if (isPullToRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoadingSettlement(true);
    }

    try {
      if (user?.id) {
        const data = await getAffiliateSettlementData(
          user.id,
          profile?.nombre_completo || profile?.comercio_nombre || ''
        );
        setSettlementData(data);
      }
    } catch (err) {
      console.error('[AffiliateHome] Error cargando liquidación:', err);
    } finally {
      setIsLoadingSettlement(false);
      setIsRefreshing(false);
    }
  }, [user?.id, profile?.nombre_completo, profile?.comercio_nombre]);

  // ─── ESTADOS PARA AUTOGESTIÓN PUBLICITARIA (MIS OFERTAS) ─────────────────
  const [offers, setOffers] = useState([]);
  const [isLoadingOffers, setIsLoadingOffers] = useState(false);
  const [newOfferModalVisible, setNewOfferModalVisible] = useState(false);
  const [offerName, setOfferName] = useState('');
  const [offerDesc, setOfferDesc] = useState('');
  const [offerPoints, setOfferPoints] = useState('50');
  const [offerStock, setOfferStock] = useState('25');
  const [offerCategory, setOfferCategory] = useState('Abarrotes');
  const [offerPromoType, setOfferPromoType] = useState('Descuento (Q)');
  const [isSubmittingOffer, setIsSubmittingOffer] = useState(false);
  const [isRespondingCounter, setIsRespondingCounter] = useState(false);

  // Cargar ofertas del comercio
  const loadOffers = useCallback(async () => {
    setIsLoadingOffers(true);
    try {
      if (user?.id) {
        const data = await getAffiliateOffers(
          user.id,
          profile?.nombre_completo || profile?.comercio_nombre || ''
        );
        setOffers(data);
      }
    } catch (err) {
      console.error('[AffiliateHome] Error cargando ofertas:', err);
    } finally {
      setIsLoadingOffers(false);
    }
  }, [user?.id, profile?.nombre_completo, profile?.comercio_nombre]);

  // Proponer nueva oferta
  const handleProposeOffer = async () => {
    if (!offerName.trim()) {
      Alert.alert('Campo Requerido', 'Ingresa el nombre de la oferta o descuento.');
      return;
    }
    if (!offerDesc.trim()) {
      Alert.alert('Campo Requerido', 'Ingresa una descripción clara de la oferta.');
      return;
    }
    const pointsNum = parseInt(offerPoints, 10);
    if (isNaN(pointsNum) || pointsNum <= 0) {
      Alert.alert('Puntos Inválidos', 'Ingresa una cantidad de eco-puntos válida (mayor a 0).');
      return;
    }
    const stockNum = parseInt(offerStock, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      Alert.alert('Stock Inválido', 'Ingresa un stock válido (igual o mayor a 0).');
      return;
    }

    setIsSubmittingOffer(true);
    try {
      await proposeAffiliateOffer({
        affiliateId: user.id,
        affiliateName: profile?.nombre_completo || profile?.comercio_nombre || 'Comercio Afiliado',
        nombre: offerName,
        descripcion: offerDesc,
        costoPuntos: pointsNum,
        stock: stockNum,
        categoria: offerCategory,
        tipoPromocion: offerPromoType,
      });

      await loadOffers();

      setNewOfferModalVisible(false);
      setOfferName('');
      setOfferDesc('');
      setOfferPoints('50');
      setOfferStock('25');
      setOfferPromoType('Descuento (Q)');

      Alert.alert(
        '📢 Oferta Enviada a Revisión',
        'Tu propuesta se registró en catalogo_incentivos con estado 🟡 "En Revisión". La administración de EcoRuta evaluará tu oferta o podrá formular una contrapropuesta.'
      );
    } catch (err) {
      console.error('[AffiliateHome] Error proponiendo oferta:', err);
      Alert.alert('Error', err.message || 'No se pudo guardar la propuesta en Supabase.');
    } finally {
      setIsSubmittingOffer(false);
    }
  };

  // Responder a contrapropuesta de administración
  const handleCounterProposal = (offer, accept) => {
    const actionTitle = accept ? 'Aceptar Contrapropuesta' : 'Rechazar Oferta';
    const actionMessage = accept
      ? `¿Aceptas los cambios propuestos por la administración para "${offer.nombre}"?\n\nLa oferta se activará inmediatamente y se publicará a los clientes de EcoRuta.`
      : `¿Deseas rechazar la contrapropuesta para "${offer.nombre}"?\n\nLa oferta quedará marcada como rechazada e inactiva.`;

    Alert.alert(actionTitle, actionMessage, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: accept ? 'Sí, Aceptar y Activar' : 'Sí, Rechazar',
        style: accept ? 'default' : 'destructive',
        onPress: async () => {
          setIsRespondingCounter(true);
          try {
            await respondToOfferCounterProposal(offer.id, accept);
            await loadOffers();
            Alert.alert(
              accept ? '🎉 ¡Oferta Aprobada y Activa!' : 'Oferta Rechazada',
              accept
                ? `La oferta "${offer.nombre}" ahora está aprobada y visible para todos los clientes en EcoRuta.`
                : `La oferta "${offer.nombre}" ha sido rechazada.`
            );
          } catch (err) {
            console.error('[AffiliateHome] Error respondiendo a contrapropuesta:', err);
            Alert.alert('Error', err.message || 'No se pudo actualizar la oferta.');
          } finally {
            setIsRespondingCounter(false);
          }
        },
      },
    ]);
  };

  const getPromoTypeBadge = (tipo) => {
    const raw = (tipo || 'Descuento (Q)').toLowerCase();
    if (raw.includes('%') || raw.includes('porcentaje')) {
      return {
        icon: '📉',
        label: 'Porcentaje (%)',
        bg: '#EFF6FF',
        color: '#1D4ED8',
        border: '#BFDBFE',
      };
    }
    if (raw.includes('2x1')) {
      return {
        icon: '🎁',
        label: 'Promoción 2x1',
        bg: '#FDF2F8',
        color: '#BE185D',
        border: '#FBCFE8',
      };
    }
    return {
      icon: '💰',
      label: 'Descuento (Q)',
      bg: '#F0FDF4',
      color: '#15803D',
      border: '#BBF7D0',
    };
  };

  const getOfferStatusBadge = (status) => {
    switch (status) {
      case 'aprobado':
        return {
          label: '🟢 Aprobado',
          sub: 'Visible a clientes',
          bg: '#D1FAE5',
          color: '#065F46',
          border: '#A7F3D0',
        };
      case 'contrapropuesta':
        return {
          label: '🟠 Contrapropuesta',
          sub: 'Requiere tu revisión',
          bg: '#FFEDD5',
          color: '#C2410C',
          border: '#FDBA74',
        };
      case 'rechazado':
        return {
          label: '🔴 Rechazado',
          sub: 'Inactiva',
          bg: '#FEE2E2',
          color: '#991B1B',
          border: '#FECACA',
        };
      case 'revision_admin':
      case 'en_revision':
      default:
        return {
          label: '🟡 En Revisión',
          sub: 'Evaluación administrativa',
          bg: '#FEF3C7',
          color: '#92400E',
          border: '#FDE68A',
        };
    }
  };

  useEffect(() => {
    loadSettlement();
    loadOffers();
    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadSettlement(true);
      loadOffers();
    });
    return unsubscribe;
  }, [navigation, loadSettlement, loadOffers]);

  // ─── ESCANEO Y VALIDACIÓN ANTIFRAUDE ──────────────────────────────────────
  const handleBarcodeScanned = useCallback(
    async ({ data }) => {
      if (scanned || isValidatingCitizen || verificationModalVisible || discountModalVisible) {
        return;
      }

      const rawId = (data || '').trim();
      if (!rawId) return;

      Vibration.vibrate(80);
      setScanned(true);
      setScannedCitizenId(rawId);
      setIsValidatingCitizen(true);

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
            puntos_reciclaje: 0,
            notFound: true,
          });
        }
        setVerificationModalVisible(true);
      } catch (err) {
        console.error('[AffiliateHome] Error verificando QR:', err);
        setCitizenData({
          id: rawId,
          nombre_completo: 'Fallo al Consultar Datos del Titular',
          direccion: 'Sin conexión a Supabase',
          activo: false,
          estado_suscripcion: 'Desconocido',
          puntos_reciclaje: 0,
        });
        setVerificationModalVisible(true);
      } finally {
        setIsValidatingCitizen(false);
      }
    },
    [scanned, isValidatingCitizen, verificationModalVisible, discountModalVisible]
  );

  // Escaneo manual / código escrito
  const handleManualScan = () => {
    if (!manualCode.trim()) {
      Alert.alert('Código Requerido', 'Ingresa el UUID o código QR del cliente.');
      return;
    }
    handleBarcodeScanned({ data: manualCode.trim() });
  };

  // ─── VALIDACIÓN ANTIFRAUDE: RECHAZAR CLIENTE ──────────────────────────────
  const handleRejectCitizen = async () => {
    Alert.alert(
      '⚠️ Rechazar Cliente y Registrar Alerta',
      `¿Deseas reportar este código QR (${scannedCitizenId}) como irregular o sospechoso? Se guardará un registro de auditoría en Supabase.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, Rechazar y Reportar',
          style: 'destructive',
          onPress: async () => {
            try {
              await reportFraudLog({
                qr_code: scannedCitizenId,
                cliente_id: citizenData?.id || scannedCitizenId,
                operario_id: user?.id,
                operario_nombre: profile?.nombre_completo || 'Comercio Afiliado',
                codigo_camion: 'TIENDA-POS',
                ruta_asignada: 'Comercio Afiliado de Palín',
                motivo: 'Rechazado en tienda por Comercio Afiliado (Antifraude)',
                direccion_declarada: citizenData?.direccion || 'En Establecimiento',
                titular_declarado: citizenData?.nombre_completo || 'Desconocido',
              });

              setVerificationModalVisible(false);
              setCitizenData(null);
              setScanned(false);
              setManualCode('');

              Alert.alert('Alerta Registrada', 'El código fue rechazado y reportado a Gestión EcoRuta.');
            } catch (err) {
              Alert.alert('Error', err.message || 'No se pudo registrar la alerta.');
            }
          },
        },
      ]
    );
  };

  // ─── VALIDACIÓN ANTIFRAUDE: CONFIRMAR CLIENTE ─────────────────────────────
  const handleConfirmCitizen = () => {
    setVerificationModalVisible(false);
    // Abrir formulario de compra y descuento
    setPurchaseAmount('');
    setPointsToRedeem('50'); // Sugerencia inicial: 50 pts = Q5.00
    setTicketNo(`TKT-${Date.now().toString().slice(-4)}`);
    setDiscountModalVisible(true);
  };

  // ─── PROCESAR DESCUENTO EN CAJA ───────────────────────────────────────────
  const handleApplyDiscount = async () => {
    const purchase = parseFloat(purchaseAmount);
    const points = parseInt(pointsToRedeem, 10);

    if (isNaN(purchase) || purchase <= 0) {
      Alert.alert('Monto Inválido', 'Ingresa el monto total de la compra en Quetzales.');
      return;
    }

    if (isNaN(points) || points <= 0) {
      Alert.alert('Puntos Inválidos', 'Ingresa la cantidad de eco-puntos a canjear.');
      return;
    }

    const availablePoints = citizenData?.puntos_reciclaje || 0;
    if (points > availablePoints) {
      Alert.alert(
        'Puntos Insuficientes',
        `El cliente solo tiene ${availablePoints} puntos disponibles. No puedes descontar ${points} pts.`
      );
      return;
    }

    // Regla de canje oficial: 10 puntos = Q1.00 de descuento
    const discountInQ = parseFloat((points * 0.1).toFixed(2));
    if (discountInQ > purchase) {
      Alert.alert(
        'Descuento Excesivo',
        `El descuento (Q${discountInQ}) no puede ser mayor que el total de la compra (Q${purchase}).`
      );
      return;
    }

    const netToPay = (purchase - discountInQ).toFixed(2);

    Alert.alert(
      '🛍️ Confirmar Descuento en Caja',
      `• Compra Total: Q${purchase.toFixed(2)}\n• Descuento EcoRuta: -Q${discountInQ.toFixed(2)} (${points} pts)\n• Total a cobrar al cliente: Q${netToPay}\n• Comisión CPA cliente referido: Q1.50\n\n¿Deseas confirmar la transacción y registrar la comisión a pagar a EcoRuta?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, Aplicar Descuento',
          style: 'default',
          onPress: async () => {
            setIsProcessingDiscount(true);
            try {
              const res = await processAffiliateDiscount({
                affiliateId: user?.id,
                affiliateName: profile?.nombre_completo || 'Comercio Afiliado de Palín',
                clientId: citizenData?.id,
                purchaseAmount: purchase,
                pointsToRedeem: points,
                discountAmount: discountInQ,
                receiptNo: ticketNo.trim(),
              });

              // Recargar estado de cuenta
              await loadSettlement(true);

              setDiscountModalVisible(false);
              setCitizenData(null);
              setScanned(false);
              setManualCode('');

              Alert.alert(
                '🎉 ¡Transacción Exitosa!',
                `Se aplicó el descuento de Q${discountInQ.toFixed(2)} al cliente.\n\nNuevo saldo del cliente: ${res.nuevoSaldo} pts.\n\nSe registró la comisión de Q1.50 por cliente referido (CPA) a pagar a EcoRuta.`
              );
            } catch (err) {
              console.error('[AffiliateHome] Error procesando descuento:', err);
              Alert.alert('Error en Canje', err.message || 'No se pudo procesar el descuento en Supabase.');
            } finally {
              setIsProcessingDiscount(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* ── ENCABEZADO SUPERIOR ────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.roleTag}>
            <Text style={styles.roleTagText}>🏪 Rol: Comercio Afiliado</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.8}>
            <Text style={styles.logoutBtnText}>Salir</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.businessTitle}>
          {profile?.nombre_completo || profile?.comercio_nombre || 'Mi Comercio Afiliado'}
        </Text>
        <Text style={styles.businessSub}>Red de Comercios Aliados • Palín, Escuintla</Text>

        {/* SELECTOR DE PESTAÑAS */}
        <View style={styles.segmentContainer}>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'caja' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('caja')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentBtnText, activeTab === 'caja' && styles.segmentBtnTextActive]}>
              📷 Caja QR
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'ofertas' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('ofertas')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.segmentBtnText,
                activeTab === 'ofertas' && styles.segmentBtnTextActive,
              ]}
            >
              📢 Mis Ofertas
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'liquidacion' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('liquidacion')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.segmentBtnText,
                activeTab === 'liquidacion' && styles.segmentBtnTextActive,
              ]}
            >
              🧾 Estado de Cuenta
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'historial' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('historial')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.segmentBtnText,
                activeTab === 'historial' && styles.segmentBtnTextActive,
              ]}
            >
              📋 Historial
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              loadSettlement(true);
              loadOffers();
            }}
            colors={[THEME.roles.afiliado]}
            tintColor={THEME.roles.afiliado}
          />
        }
      >
        {activeTab === 'ofertas' && (
          /* ── PESTAÑA: MIS OFERTAS (AUTOGESTIÓN PUBLICITARIA) ─────────────── */
          <View>
            {/* Tarjeta Hero de Autogestión */}
            <View style={styles.offersHeroCard}>
              <View style={styles.offersHeroTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.offersHeroBadge}>AUTOGESTIÓN PUBLICITARIA</Text>
                  <Text style={styles.offersHeroTitle}>Catálogo de Ofertas</Text>
                </View>
                <Text style={styles.offersHeroIcon}>📢</Text>
              </View>
              <Text style={styles.offersHeroDesc}>
                Publica ofertas y recompensas exclusivas para que los vecinos de Palín las canjeen con sus eco-puntos.
              </Text>
              <TouchableOpacity
                style={styles.proposeNewOfferBtn}
                onPress={() => setNewOfferModalVisible(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.proposeNewOfferBtnIcon}>➕</Text>
                <Text style={styles.proposeNewOfferBtnText}>Proponer Nueva Oferta</Text>
              </TouchableOpacity>
            </View>

            {/* Encabezado de la lista */}
            <View style={styles.offersListHeaderRow}>
              <Text style={styles.sectionHeading}>
                Ofertas Propuestas ({offers.length})
              </Text>
              {isLoadingOffers && <ActivityIndicator size="small" color="#0D9488" />}
            </View>

            {offers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>🎁</Text>
                <Text style={styles.emptyTitle}>Sin ofertas registradas</Text>
                <Text style={styles.emptySub}>
                  Aún no has propuesto ofertas para los clientes. Presiona "Proponer Nueva Oferta" para comenzar a atraer clientes a tu comercio.
                </Text>
                <TouchableOpacity
                  style={styles.emptyActionBtn}
                  onPress={() => setNewOfferModalVisible(true)}
                >
                  <Text style={styles.emptyActionBtnText}>➕ Crear Primera Oferta</Text>
                </TouchableOpacity>
              </View>
            ) : (
              offers.map((offer) => {
                const badge = getOfferStatusBadge(offer.estado_aprobacion);
                const isCounter = offer.estado_aprobacion === 'contrapropuesta';

                return (
                  <View key={offer.id?.toString()} style={styles.offerItemCard}>
                    {/* Header de la oferta con Título e Insignia */}
                    <View style={styles.offerCardTop}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <View style={styles.offerTitleRow}>
                          <Text style={styles.offerTitle}>{offer.nombre}</Text>
                          {(() => {
                            const pBadge = getPromoTypeBadge(offer.tipo_promocion);
                            return (
                              <View
                                style={[
                                  styles.promoTypeBadge,
                                  { backgroundColor: pBadge.bg, borderColor: pBadge.border },
                                ]}
                              >
                                <Text style={[styles.promoTypeBadgeText, { color: pBadge.color }]}>
                                  {pBadge.icon} {pBadge.label}
                                </Text>
                              </View>
                            );
                          })()}
                        </View>
                        <Text style={styles.offerCategoryTag}>
                          🏷️ {offer.categoria || 'Comercio Local'}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.offerStatusBadge,
                          { backgroundColor: badge.bg, borderColor: badge.border },
                        ]}
                      >
                        <Text style={[styles.offerStatusBadgeText, { color: badge.color }]}>
                          {badge.label}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.offerDesc}>{offer.descripcion}</Text>

                    {/* Fila de Métricas: Puntos y Stock */}
                    <View style={styles.offerMetricsRow}>
                      <View style={styles.offerMetricItem}>
                        <Text style={styles.offerMetricVal}>
                          ⭐ {offer.puntos_requeridos ?? offer.costo_puntos} pts
                        </Text>
                        <Text style={styles.offerMetricSub}>
                          (≈ Q{(((offer.puntos_requeridos ?? offer.costo_puntos) || 0) * 0.1).toFixed(2)})
                        </Text>
                      </View>
                      <View style={styles.offerMetricDivider} />
                      <View style={styles.offerMetricItem}>
                        <Text style={styles.offerMetricVal}>📦 {offer.stock}</Text>
                        <Text style={styles.offerMetricSub}>en existencias</Text>
                      </View>
                      <View style={styles.offerMetricDivider} />
                      <View style={styles.offerMetricItem}>
                        <Text style={styles.offerMetricVal}>
                          {offer.activo ? '🟢 Activa' : '⚪ En Pausa'}
                        </Text>
                        <Text style={styles.offerMetricSub}>para clientes</Text>
                      </View>
                    </View>

                    {/* ── SECCIÓN ESPECIAL: SI TIENE CONTRAPROPUESTA ── */}
                    {isCounter && (
                      <View style={styles.counterBox}>
                        <View style={styles.counterHeaderRow}>
                          <Text style={styles.counterIcon}>📝</Text>
                          <Text style={styles.counterTitle}>
                            Ajuste Propuesto por Administración EcoRuta:
                          </Text>
                        </View>
                        <Text style={styles.counterNotes}>
                          {offer.notas_admin ||
                            'Se sugiere ajustar el canje de puntos o el stock para optimizar la rotación de clientes.'}
                        </Text>

                        {/* Botones de Acción Obligatorios */}
                        <View style={styles.counterButtonsRow}>
                          <TouchableOpacity
                            style={[
                              styles.acceptCounterBtn,
                              isRespondingCounter && styles.btnDisabled,
                            ]}
                            onPress={() => handleCounterProposal(offer, true)}
                            disabled={isRespondingCounter}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.acceptCounterBtnIcon}>✅</Text>
                            <Text style={styles.acceptCounterBtnText}>Aceptar Cambios</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.rejectCounterBtn,
                              isRespondingCounter && styles.btnDisabled,
                            ]}
                            onPress={() => handleCounterProposal(offer, false)}
                            disabled={isRespondingCounter}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.rejectCounterBtnIcon}>✕</Text>
                            <Text style={styles.rejectCounterBtnText}>Rechazar Oferta</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {activeTab === 'caja' && (
          /* ── PESTAÑA 1: CAJA Y ESCÁNER QR CON ANTIFRAUDE ────────────────── */
          <View>
            {/* Banner Informativo */}
            <View style={styles.scanBanner}>
              <Text style={styles.scanBannerTitle}>📷 Escanea el Código del Vecino</Text>
              <Text style={styles.scanBannerSub}>
                Apunta al código QR del cliente para verificar su identidad y saldo antes de aplicar el descuento.
              </Text>
            </View>

            {/* Cámara Nativa / Visor QR */}
            <View style={styles.scannerWrapper}>
              {Platform.OS === 'web' ? (
                <View style={styles.webCameraFallback}>
                  <Text style={styles.cameraIcon}>📷</Text>
                  <Text style={styles.cameraTitle}>Visor de Cámara Web</Text>
                  <Text style={styles.cameraSub}>
                    En navegadores web puedes ingresar el código del QR manualmente abajo.
                  </Text>
                </View>
              ) : permission?.granted ? (
                <View style={styles.cameraBox}>
                  <CameraView
                    style={StyleSheet.absoluteFillObject}
                    facing="back"
                    barcodeScannerSettings={{
                      barcodeTypes: ['qr'],
                    }}
                    onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                  />
                  <View style={styles.scannerCrosshair} />
                  {scanned && (
                    <View style={styles.scannedOverlay}>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.scannedOverlayText}>QR detectado. Validando...</Text>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.permissionBox}>
                  <Text style={styles.permissionIcon}>🔒</Text>
                  <Text style={styles.permissionTitle}>Permiso de Cámara Requerido</Text>
                  <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
                    <Text style={styles.permissionBtnText}>Conceder Permiso</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Entrada Manual o Lector de Código de Barras HID */}
            <View style={styles.manualInputCard}>
              <Text style={styles.manualInputLabel}>O ingresa el código del vecino manualmente:</Text>
              <View style={styles.manualInputRow}>
                <TextInput
                  style={styles.manualInput}
                  placeholder="Ej. UUID del ciudadano o código QR"
                  value={manualCode}
                  onChangeText={setManualCode}
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={[styles.manualScanBtn, isValidatingCitizen && styles.manualScanBtnDisabled]}
                  onPress={handleManualScan}
                  disabled={isValidatingCitizen}
                >
                  {isValidatingCitizen ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.manualScanBtnText}>Verificar 🔍</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Guía Rápida de Conversión */}
            <View style={styles.conversionInfoCard}>
              <Text style={styles.conversionTitle}>💡 Tabla de Conversión de Puntos Oficial</Text>
              <View style={styles.conversionRow}>
                <Text style={styles.conversionItem}>• 10 Puntos = Q1.00</Text>
                <Text style={styles.conversionItem}>• 50 Puntos = Q5.00</Text>
                <Text style={styles.conversionItem}>• 100 Puntos = Q10.00</Text>
              </View>
              <Text style={styles.conversionFootnote}>
                Modelo CPA: Descuento canjeado en tienda por el cliente. Por cada cliente referido, el comercio abona una comisión fija de Q1.50 a EcoRuta.
              </Text>
            </View>
          </View>
        )}

        {activeTab === 'liquidacion' && (
          /* ── PESTAÑA 2: ESTADO DE CUENTA CPA (EL COMERCIO LE PAGA A ECORUTA) ── */
          <View>
            {/* Tarjeta Principal de Saldo a Pagar a EcoRuta */}
            <View style={styles.settlementHeroCard}>
              <Text style={styles.settlementHeroLabel}>SALDO A PAGAR A ECORUTA</Text>
              <Text style={styles.settlementHeroAmount}>
                Q{settlementData.totalPendiente.toFixed(2)}
              </Text>
              <View style={styles.settlementStatusPill}>
                <Text style={styles.settlementStatusText}>
                  ⏳ estado_liquidacion: 'pendiente_pago_a_ecoruta'
                </Text>
              </View>

              <View style={styles.settlementDivider} />

              <View style={styles.settlementMetricsRow}>
                <View style={styles.settlementMetric}>
                  <Text style={styles.settlementMetricVal}>
                    {settlementData.canjesPendientes.length}
                  </Text>
                  <Text style={styles.settlementMetricLabel}>Clientes Referidos</Text>
                </View>
                <View style={styles.settlementMetric}>
                  <Text style={styles.settlementMetricVal}>Q1.50</Text>
                  <Text style={styles.settlementMetricLabel}>Comisión CPA / Cliente</Text>
                </View>
                <View style={styles.settlementMetric}>
                  <Text style={styles.settlementMetricVal}>{settlementData.totalPuntos}</Text>
                  <Text style={styles.settlementMetricLabel}>Puntos Canjeados</Text>
                </View>
              </View>

              {/* Botón Principal: Pagar Saldo a EcoRuta */}
              <TouchableOpacity
                style={[
                  styles.payBalanceBtn,
                  settlementData.totalPendiente <= 0 && styles.payBalanceBtnDisabled,
                ]}
                onPress={() => {
                  if (settlementData.totalPendiente <= 0) {
                    Alert.alert('Sin Saldo Pendiente', 'Tu estado de cuenta con EcoRuta está completamente al día.');
                    return;
                  }
                  setPaymentModalVisible(true);
                }}
                disabled={settlementData.totalPendiente <= 0}
                activeOpacity={0.85}
              >
                <Text style={styles.payBalanceBtnIcon}>💳</Text>
                <Text style={styles.payBalanceBtnText}>
                  Pagar Saldo a EcoRuta (Q{settlementData.totalPendiente.toFixed(2)})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Banner Informativo: Corte de Facturación EcoRuta */}
            <View style={styles.treasuryNoticeCard}>
              <Text style={styles.treasuryNoticeIcon}>🏛️</Text>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.treasuryNoticeTitle}>Corte de Facturación EcoRuta</Text>
                <Text style={styles.treasuryNoticeDesc}>
                  El comercio afiliado debe depositar el total de comisiones por clientes referidos a las cuentas oficiales de EcoRuta los días 1 y 15 de cada mes.
                </Text>
              </View>
            </View>

            {/* Lista de Transacciones Pendientes de Liquidación */}
            <Text style={styles.sectionHeading}>
              Comisiones CPA Pendientes ({settlementData.canjesPendientes.length})
            </Text>

            {settlementData.canjesPendientes.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>🎉</Text>
                <Text style={styles.emptyTitle}>¡Todo al día!</Text>
                <Text style={styles.emptySub}>
                  No tienes comisiones pendientes de pago a EcoRuta en este momento.
                </Text>
              </View>
            ) : (
              settlementData.canjesPendientes.map((c) => {
                const discount = c.monto_descuento ? parseFloat(c.monto_descuento) : (c.puntos_descontados || 0) * 0.1;
                return (
                  <View key={c.id?.toString()} style={styles.settlementItemCard}>
                    <View style={styles.settlementItemTop}>
                      <View>
                        <Text style={styles.settlementItemClient}>
                          {c.detalles?.ticket_comercio || 'Ticket de Descuento'}
                        </Text>
                        <Text style={styles.settlementItemDate}>
                          📅{' '}
                          {c.fecha_canje
                            ? new Date(c.fecha_canje).toLocaleDateString('es-GT', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Reciente'}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.settlementItemAmount}>Q1.50</Text>
                        <Text style={styles.settlementItemPoints}>Descuento dado: Q{discount.toFixed(2)}</Text>
                      </View>
                    </View>
                    <View style={styles.settlementBadgePending}>
                      <Text style={styles.settlementBadgePendingText}>
                        • Pendiente de Pago a EcoRuta
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {activeTab === 'historial' && (
          /* ── PESTAÑA 3: HISTORIAL COMPLETO DE CANJES ─────────────────────── */
          <View>
            <Text style={styles.sectionHeading}>Historial General de Canjes en Tienda</Text>
            {settlementData.canjesPendientes.length === 0 &&
            settlementData.canjesLiquidados.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>🧾</Text>
                <Text style={styles.emptyTitle}>Sin historial de canjes</Text>
                <Text style={styles.emptySub}>
                  Los canjes procesados en tu tienda aparecerán registrados aquí.
                </Text>
              </View>
            ) : (
              [...settlementData.canjesPendientes, ...settlementData.canjesLiquidados].map((c) => (
                <View key={c.id?.toString()} style={styles.settlementItemCard}>
                  <View style={styles.settlementItemTop}>
                    <View>
                      <Text style={styles.settlementItemClient}>
                        {c.detalles?.ticket_comercio || 'Transacción de Canje'}
                      </Text>
                      <Text style={styles.settlementItemDate}>
                        📅 {new Date(c.fecha_canje || Date.now()).toLocaleDateString('es-GT')}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.settlementItemAmount}>
                        Q{(c.monto_descuento || (c.puntos_descontados || 0) * 0.1).toFixed(2)}
                      </Text>
                      <Text style={styles.settlementItemPoints}>⭐ {c.puntos_descontados} pts</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* ── MODAL 1: VALIDACIÓN VISUAL ANTIFRAUDE (PANTALLA COMPLETA) ────────── */}
      <Modal visible={verificationModalVisible} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.antifraudModalContainer}>
          <ScrollView contentContainerStyle={styles.antifraudScroll}>
            {/* Header de Alerta */}
            <View style={styles.antifraudHeaderBadge}>
              <Text style={styles.antifraudHeaderIcon}>🛡️</Text>
              <Text style={styles.antifraudHeaderTitle}>VALIDACIÓN VISUAL ANTIFRAUDE</Text>
              <Text style={styles.antifraudHeaderSub}>Verifica la identidad del vecino antes de cobrar</Text>
            </View>

            {/* Datos Masivos en Letras Grandes */}
            <View style={styles.antifraudCard}>
              <Text style={styles.antifraudFieldLabel}>NOMBRE DEL TITULAR</Text>
              <Text style={styles.antifraudCitizenName}>
                {citizenData?.nombre_completo || 'Titular Desconocido'}
              </Text>

              <View style={styles.antifraudDivider} />

              <Text style={styles.antifraudFieldLabel}>DIRECCIÓN FÍSICA EXACTA</Text>
              <Text style={styles.antifraudCitizenAddress}>
                📍 {citizenData?.direccion || 'Sin dirección registrada en Palín'}
              </Text>

              <View style={styles.antifraudDivider} />

              <Text style={styles.antifraudFieldLabel}>SALDO ACTUAL DE ECO-PUNTOS</Text>
              <View style={styles.pointsHighlightBox}>
                <Text style={styles.pointsHighlightVal}>
                  ⭐ {citizenData?.puntos_reciclaje || 0} pts
                </Text>
                <Text style={styles.pointsHighlightEquiv}>
                  ≈ Q{((citizenData?.puntos_reciclaje || 0) * 0.1).toFixed(2)} en descuentos
                </Text>
              </View>

              <View style={styles.antifraudDivider} />

              <Text style={styles.antifraudFieldLabel}>ESTADO DE SUSCRIPCIÓN</Text>
              <Text style={styles.antifraudSubscriptionText}>
                {citizenData?.estado_suscripcion || 'Activo'}
              </Text>
            </View>

            {/* BOTONES MASIVOS: CONFIRMAR VS RECHAZAR */}
            <View style={styles.antifraudActionsRow}>
              <TouchableOpacity
                style={styles.antifraudConfirmBtn}
                onPress={handleConfirmCitizen}
                activeOpacity={0.85}
              >
                <Text style={styles.antifraudBtnIcon}>✅</Text>
                <Text style={styles.antifraudBtnText}>Confirmar Cliente y Proceder</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.antifraudRejectBtn}
                onPress={handleRejectCitizen}
                activeOpacity={0.85}
              >
                <Text style={styles.antifraudBtnIcon}>❌</Text>
                <Text style={styles.antifraudRejectBtnText}>Rechazar (Posible Fraude)</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── MODAL 2: APLICAR DESCUENTO EN CAJA ───────────────────────────────── */}
      <Modal visible={discountModalVisible} transparent animationType="slide">
        <View style={styles.discountModalOverlay}>
          <View style={styles.discountModalSheet}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.discountModalTitle}>Aplicar Descuento en Caja</Text>
                <Text style={styles.discountModalSub}>
                  Cliente: {citizenData?.nombre_completo?.split(' ')[0] || 'Vecino'} (Saldo: {citizenData?.puntos_reciclaje || 0} pts)
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setDiscountModalVisible(false)}
                style={styles.modalCloseCircle}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Monto Total de la Compra (Q) *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ej. 125.00"
                keyboardType="decimal-pad"
                value={purchaseAmount}
                onChangeText={setPurchaseAmount}
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.inputLabel}>Puntos a Canjear (10 pts = Q1.00) *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ej. 50"
                keyboardType="numeric"
                value={pointsToRedeem}
                onChangeText={setPointsToRedeem}
                placeholderTextColor="#94A3B8"
              />

              {/* Botones rápidos de puntos */}
              <View style={styles.pointsChipsRow}>
                {[20, 50, 80, 100].map((pts) => (
                  <TouchableOpacity
                    key={pts}
                    style={[
                      styles.pointsChip,
                      pointsToRedeem === pts.toString() && styles.pointsChipActive,
                    ]}
                    onPress={() => setPointsToRedeem(pts.toString())}
                  >
                    <Text
                      style={[
                        styles.pointsChipText,
                        pointsToRedeem === pts.toString() && styles.pointsChipTextActive,
                      ]}
                    >
                      {pts} pts (Q{(pts * 0.1).toFixed(0)})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>No. de Ticket / Factura de Tienda</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ej. TKT-00451"
                value={ticketNo}
                onChangeText={setTicketNo}
                placeholderTextColor="#94A3B8"
              />

              {/* Resumen del cobro final */}
              {parseFloat(purchaseAmount) > 0 && parseInt(pointsToRedeem, 10) > 0 && (
                <View style={styles.summaryBreakdown}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Subtotal de Compra:</Text>
                    <Text style={styles.summaryVal}>
                      Q{parseFloat(purchaseAmount || 0).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabelGreen}>
                      Descuento EcoRuta ({pointsToRedeem} pts):
                    </Text>
                    <Text style={styles.summaryValGreen}>
                      - Q{(parseInt(pointsToRedeem || 0, 10) * 0.1).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryTotalLabel}>Total a cobrar al cliente:</Text>
                    <Text style={styles.summaryTotalVal}>
                      Q
                      {Math.max(
                        0,
                        parseFloat(purchaseAmount || 0) -
                          parseInt(pointsToRedeem || 0, 10) * 0.1
                      ).toFixed(2)}
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.confirmDiscountBtn,
                isProcessingDiscount && styles.confirmDiscountBtnDisabled,
              ]}
              onPress={handleApplyDiscount}
              disabled={isProcessingDiscount}
              activeOpacity={0.85}
            >
              {isProcessingDiscount ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.confirmDiscountBtnText}>Procesando canje en Supabase...</Text>
                </View>
              ) : (
                <Text style={styles.confirmDiscountBtnText}>
                  Confirmar Canje y Aplicar Descuento ⭐
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── MODAL 3: PASARELA DE PAGOS B2B (EL COMERCIO LE PAGA A ECORUTA) ── */}
      <Modal visible={paymentModalVisible} transparent animationType="slide">
        <View style={styles.b2bModalOverlay}>
          <View style={styles.b2bModalSheet}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalTitle}>Pagar Saldo a EcoRuta</Text>
                <Text style={styles.modalSubtitle}>
                  Comisiones CPA por Clientes Referidos • Facturación B2B
                </Text>
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
              <Text style={styles.amountLabel}>TOTAL DE COMISIONES A PAGAR</Text>
              <Text style={styles.amountValue}>
                Q{settlementData.totalPendiente.toFixed(2)}
              </Text>
              <Text style={styles.amountPeriod}>
                Concepto: pago_comisiones_cpa ({settlementData.canjesPendientes.length} referidos)
              </Text>
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
                /* ── OPCIÓN A: TRANSFERENCIA BANCARIA CON IMAGE PICKER ── */
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

                  <Text style={styles.inputLabel}>Foto del Voucher o Comprobante de Pago *</Text>

                  {voucherUri ? (
                    <View style={styles.voucherPreviewContainer}>
                      <Image source={{ uri: voucherUri }} style={styles.voucherPreviewImage} />
                      <View style={styles.voucherOverlayActions}>
                        <Text style={styles.voucherSuccessTag}>✅ Comprobante adjunto</Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                          <TouchableOpacity
                            style={styles.voucherChangeBtn}
                            onPress={handlePickVoucher}
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
                      <Text style={styles.uploadTitle}>Adjunta la foto de tu comprobante bancario</Text>
                      <Text style={styles.uploadSub}>
                        Usa la cámara de tu móvil o selecciona una captura desde tu galería
                      </Text>

                      <View style={styles.uploadBtnRow}>
                        <TouchableOpacity style={styles.uploadActionBtn} onPress={handlePickVoucher}>
                          <Text style={styles.uploadActionBtnText}>🖼️ Abrir Galería</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.uploadActionBtn} onPress={handleTakeVoucherPhoto}>
                          <Text style={styles.uploadActionBtnText}>📸 Tomar Foto</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              ) : (
                /* ── OPCIÓN B: PAGO EN LÍNEA SIMULADO ── */
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
                        <Text style={styles.virtualCardLabel}>TITULAR DEL COMERCIO</Text>
                        <Text style={styles.virtualCardHolder}>
                          {(cardHolder || profile?.nombre_completo || 'NOMBRE TITULAR').toUpperCase()}
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
                      Pasarela B2B Segura EcoRuta • Cifrado TLS 256-bit
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* BOTÓN DE CONFIRMAR PAGO */}
            <TouchableOpacity
              style={[styles.submitB2BPaymentBtn, isSubmittingPayment && styles.submitB2BPaymentBtnDisabled]}
              onPress={handleSubmitB2BPayment}
              disabled={isSubmittingPayment}
              activeOpacity={0.85}
            >
              {isSubmittingPayment ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.submitB2BPaymentBtnText}>Registrando pago en pagos_comercios...</Text>
                </View>
              ) : (
                <Text style={styles.submitB2BPaymentBtnText}>
                  {paymentMethod === 'transferencia'
                    ? 'Enviar Comprobante a EcoRuta 📤'
                    : `Pagar Q${settlementData.totalPendiente.toFixed(2)} con Tarjeta 🔒`}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── MODAL 4: PROPONER NUEVA OFERTA PUBLICITARIA (B2B) ──────────────── */}
      <Modal visible={newOfferModalVisible} transparent animationType="slide">
        <View style={styles.b2bModalOverlay}>
          <View style={styles.b2bModalSheet}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalTitle}>Proponer Nueva Oferta</Text>
                <Text style={styles.modalSubtitle}>
                  EcoRuta Palín • Red de Comercios Aliados
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setNewOfferModalVisible(false)}
                style={styles.modalCloseCircle}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
              <Text style={styles.inputLabel}>Nombre de la Oferta / Descuento *</Text>
              <TextInput
                style={styles.modalTextInput}
                placeholder="Ej. 20% de Descuento en Compras Mayores a Q50"
                value={offerName}
                onChangeText={setOfferName}
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.inputLabel}>Descripción Detallada *</Text>
              <TextInput
                style={[styles.modalTextInput, { height: 75, textAlignVertical: 'top' }]}
                placeholder="Detalla los términos: aplica en productos seleccionados, consumo en tienda, etc."
                multiline
                numberOfLines={3}
                value={offerDesc}
                onChangeText={setOfferDesc}
                placeholderTextColor="#94A3B8"
              />

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Puntos Requeridos *</Text>
                  <TextInput
                    style={styles.modalTextInput}
                    placeholder="50"
                    keyboardType="numeric"
                    value={offerPoints}
                    onChangeText={setOfferPoints}
                    placeholderTextColor="#94A3B8"
                  />
                  <Text style={styles.inputHelperText}>
                    ≈ Q{((parseInt(offerPoints || '0', 10) || 0) * 0.1).toFixed(2)} de valor
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Stock Disponible *</Text>
                  <TextInput
                    style={styles.modalTextInput}
                    placeholder="25"
                    keyboardType="numeric"
                    value={offerStock}
                    onChangeText={setOfferStock}
                    placeholderTextColor="#94A3B8"
                  />
                  <Text style={styles.inputHelperText}>Límite de canjes</Text>
                </View>
              </View>

              {/* Selector interactivo de tipo de promoción */}
              <Text style={styles.inputLabel}>Tipo de Promoción *</Text>
              <View style={styles.promoTypeSelectorRow}>
                {[
                  { id: 'Descuento (Q)', label: 'Descuento (Q)', icon: '💰' },
                  { id: 'Porcentaje (%)', label: 'Porcentaje (%)', icon: '📉' },
                  { id: 'Promoción 2x1', label: 'Promoción 2x1', icon: '🎁' },
                ].map((item) => {
                  const isSelected = offerPromoType === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.promoSelectChip,
                        isSelected && styles.promoSelectChipActive,
                      ]}
                      onPress={() => setOfferPromoType(item.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.promoSelectChipIcon}>{item.icon}</Text>
                      <Text
                        style={[
                          styles.promoSelectChipText,
                          isSelected && styles.promoSelectChipTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.inputLabel}>Categoría Comercial</Text>
              <View style={styles.categoryChipsWrap}>
                {[
                  'Abarrotes',
                  'Restaurante / Café',
                  'Hogar',
                  'Salud & Farmacia',
                  'Ferretería',
                  'Moda',
                ].map((cat) => {
                  const isSelected = offerCategory === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.categorySelectChip,
                        isSelected && styles.categorySelectChipActive,
                      ]}
                      onPress={() => setOfferCategory(cat)}
                    >
                      <Text
                        style={[
                          styles.categorySelectChipText,
                          isSelected && styles.categorySelectChipTextActive,
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.offerNoticeBox}>
                <Text style={styles.offerNoticeText}>
                  🛡️ Esta oferta se registrará en `catalogo_incentivos` con estado 🟡
                  "En Revisión". La administración de EcoRuta evaluará tu propuesta o
                  podrá sugerirte un ajuste vía contrapropuesta.
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.submitB2BPaymentBtn,
                isSubmittingOffer && styles.submitB2BPaymentBtnDisabled,
              ]}
              onPress={handleProposeOffer}
              disabled={isSubmittingOffer}
              activeOpacity={0.85}
            >
              {isSubmittingOffer ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.submitB2BPaymentBtnText}>
                    Guardando en catalogo_incentivos...
                  </Text>
                </View>
              ) : (
                <Text style={styles.submitB2BPaymentBtnText}>
                  Enviar Propuesta a Revisión 🚀
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
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  roleTag: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleTagText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  logoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  logoutBtnText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  businessTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  businessSub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
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
    paddingVertical: 8,
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
    color: '#0D9488',
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
  scanBanner: {
    backgroundColor: '#CCFBF1',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  scanBannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F766E',
    marginBottom: 2,
  },
  scanBannerSub: {
    fontSize: 12,
    color: '#115E59',
    lineHeight: 16,
  },
  scannerWrapper: {
    height: 280,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    marginBottom: 16,
    position: 'relative',
    borderWidth: 2,
    borderColor: '#0D9488',
  },
  cameraBox: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerCrosshair: {
    width: 200,
    height: 200,
    borderWidth: 2,
    borderColor: '#2DD4BF',
    borderRadius: 16,
    backgroundColor: 'rgba(45, 212, 191, 0.08)',
  },
  scannedOverlay: {
    position: 'absolute',
    bottom: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scannedOverlayText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  webCameraFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#1E293B',
  },
  cameraIcon: {
    fontSize: 44,
    marginBottom: 8,
  },
  cameraTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cameraSub: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#1E293B',
  },
  permissionIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  permissionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  permissionBtn: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  permissionBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  manualInputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  manualInputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 8,
  },
  manualInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  manualInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: THEME.colors.textPrimary,
  },
  manualScanBtn: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 10,
  },
  manualScanBtnDisabled: {
    opacity: 0.7,
  },
  manualScanBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  conversionInfoCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  conversionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 8,
  },
  conversionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  conversionItem: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
  },
  conversionFootnote: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    fontStyle: 'italic',
  },
  // Liquidación
  settlementHeroCard: {
    backgroundColor: '#115E59',
    borderRadius: 20,
    padding: 22,
    marginBottom: 16,
    shadowColor: '#115E59',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  settlementHeroLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#99F6E4',
    letterSpacing: 0.8,
  },
  settlementHeroAmount: {
    fontSize: 38,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 4,
  },
  settlementStatusPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  settlementStatusText: {
    fontSize: 11,
    color: '#E6FFFA',
    fontWeight: '700',
  },
  settlementDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginVertical: 16,
  },
  settlementMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  settlementMetric: {
    alignItems: 'center',
  },
  settlementMetricVal: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  settlementMetricLabel: {
    fontSize: 11,
    color: '#A7F3D0',
    marginTop: 2,
    fontWeight: '600',
  },
  treasuryNoticeCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  treasuryNoticeIcon: {
    fontSize: 24,
  },
  treasuryNoticeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E40AF',
  },
  treasuryNoticeDesc: {
    fontSize: 11,
    color: '#3B82F6',
    marginTop: 2,
    lineHeight: 15,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 12,
  },
  settlementItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  settlementItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  settlementItemClient: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  settlementItemDate: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  settlementItemAmount: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0D9488',
  },
  settlementItemPoints: {
    fontSize: 11,
    color: '#D97706',
    fontWeight: '700',
  },
  settlementBadgePending: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  settlementBadgePendingText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  emptySub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
  // Modal Antifraude Pantalla Completa
  antifraudModalContainer: {
    flex: 1,
    backgroundColor: '#FEF3C7',
  },
  antifraudScroll: {
    padding: 24,
  },
  antifraudHeaderBadge: {
    alignItems: 'center',
    marginBottom: 16,
  },
  antifraudHeaderIcon: {
    fontSize: 40,
    marginBottom: 4,
  },
  antifraudHeaderTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#92400E',
    letterSpacing: 0.5,
  },
  antifraudHeaderSub: {
    fontSize: 12,
    color: '#B45309',
    marginTop: 2,
  },
  antifraudCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: '#F59E0B',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  antifraudFieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  antifraudCitizenName: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 4,
  },
  antifraudCitizenAddress: {
    fontSize: 16,
    fontWeight: '800',
    color: '#334155',
    marginTop: 4,
  },
  pointsHighlightBox: {
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  pointsHighlightVal: {
    fontSize: 24,
    fontWeight: '900',
    color: '#065F46',
  },
  pointsHighlightEquiv: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
    marginTop: 2,
  },
  antifraudSubscriptionText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#059669',
    marginTop: 4,
  },
  antifraudDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  antifraudActionsRow: {
    gap: 12,
  },
  antifraudConfirmBtn: {
    backgroundColor: '#059669',
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  antifraudRejectBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  antifraudBtnIcon: {
    fontSize: 20,
  },
  antifraudBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  antifraudRejectBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  // Modal de Descuento en Caja
  discountModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  discountModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
    ...(Platform.OS === 'web' && {
      maxWidth: 550,
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
    marginBottom: 16,
  },
  discountModalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  discountModalSub: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
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
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 6,
    marginTop: 8,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: THEME.colors.textPrimary,
  },
  pointsChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  pointsChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  pointsChipActive: {
    backgroundColor: '#0D9488',
    borderColor: '#0D9488',
  },
  pointsChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  pointsChipTextActive: {
    color: '#FFFFFF',
  },
  summaryBreakdown: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
  },
  summaryVal: {
    fontSize: 12,
    color: THEME.colors.textPrimary,
    fontWeight: '700',
  },
  summaryLabelGreen: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '700',
  },
  summaryValGreen: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '800',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 8,
  },
  summaryTotalLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  summaryTotalVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0D9488',
  },
  confirmDiscountBtn: {
    backgroundColor: '#0D9488',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmDiscountBtnDisabled: {
    opacity: 0.7,
  },
  confirmDiscountBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  // ─── ESTILOS PASARELA B2B (PAGO A ECORUTA) ─────────────────────────────────
  payBalanceBtn: {
    backgroundColor: '#F59E0B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 18,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  payBalanceBtnDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    shadowOpacity: 0,
    elevation: 0,
  },
  payBalanceBtnIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  payBalanceBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  b2bModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  b2bModalSheet: {
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
    borderColor: '#0F766E',
    backgroundColor: '#F0FDFA',
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
    color: '#0F766E',
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
  onlineCardSection: {
    marginTop: 4,
  },
  virtualCard: {
    backgroundColor: '#0F172A',
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
  submitB2BPaymentBtn: {
    backgroundColor: '#0D9488',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitB2BPaymentBtnDisabled: {
    opacity: 0.7,
  },
  submitB2BPaymentBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  // ─── ESTILOS PESTAÑA: MIS OFERTAS (AUTOGESTIÓN) ───────────────────────────
  offersHeroCard: {
    backgroundColor: '#0F766E',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#0F766E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  offersHeroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  offersHeroBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#CCFBF1',
    letterSpacing: 0.8,
  },
  offersHeroTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 2,
  },
  offersHeroIcon: {
    fontSize: 28,
  },
  offersHeroDesc: {
    fontSize: 12,
    color: '#E6FFFA',
    lineHeight: 17,
    marginBottom: 16,
  },
  proposeNewOfferBtn: {
    backgroundColor: '#F59E0B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  proposeNewOfferBtnIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  proposeNewOfferBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  offersListHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  offerItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  offerCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  offerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  offerCategoryTag: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  offerStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  offerStatusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  offerDesc: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
    marginVertical: 8,
  },
  offerMetricsRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  offerMetricItem: {
    alignItems: 'center',
  },
  offerMetricVal: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  offerMetricSub: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    marginTop: 1,
  },
  offerMetricDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },
  counterBox: {
    marginTop: 12,
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  counterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  counterIcon: {
    fontSize: 16,
  },
  counterTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#C2410C',
  },
  counterNotes: {
    fontSize: 12,
    color: '#9A3412',
    lineHeight: 16,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  counterButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  acceptCounterBtn: {
    flex: 1,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  acceptCounterBtnIcon: {
    fontSize: 13,
  },
  acceptCounterBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  rejectCounterBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  rejectCounterBtnIcon: {
    fontSize: 12,
    color: '#DC2626',
  },
  rejectCounterBtnText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  emptyActionBtn: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 14,
  },
  emptyActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  categoryChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    marginBottom: 10,
  },
  categorySelectChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categorySelectChipActive: {
    backgroundColor: '#0F766E',
    borderColor: '#0F766E',
  },
  categorySelectChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  categorySelectChipTextActive: {
    color: '#FFFFFF',
  },
  inputHelperText: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    marginTop: 2,
    marginLeft: 2,
  },
  offerNoticeBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginTop: 10,
    marginBottom: 4,
  },
  offerNoticeText: {
    fontSize: 11,
    color: '#1E40AF',
    lineHeight: 16,
  },
  offerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 2,
  },
  promoTypeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  promoTypeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  promoTypeSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  promoSelectChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  promoSelectChipActive: {
    backgroundColor: '#CCFBF1',
    borderColor: '#0D9488',
  },
  promoSelectChipIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  promoSelectChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  promoSelectChipTextActive: {
    color: '#0F766E',
    fontWeight: '800',
  },
});
