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
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/useAuthStore';
import { THEME } from '../../constants/theme';
import {
  getGlobalMetrics,
  getOffersPendingAudit,
  auditCommercialOffer,
} from '../../api/admin';
import { getRoutes } from '../../api/logistics';
import { generateAdminReportCSV } from '../../api/reports';

export default function AdminHomeScreen({ navigation }) {
  const profile = useAuthStore((state) => state.profile);
  const logout = useAuthStore((state) => state.logout);

  const [metrics, setMetrics] = useState({
    totalKg: 0,
    totalPuntos: 0,
    totalRecolecciones: 0,
    pendingCanjes: 0,
    totalClientes: 0,
    pendingOfferAudits: 0,
    materialStats: { plastico: 0, carton: 0, aluminio: 0, vidrio: 0, mixto: 0 },
  });
  const [routes, setRoutes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // ─── ESTADOS PARA AUDITORÍA DE OFERTAS COMERCIALES ───────────────────────
  const [offers, setOffers] = useState([]);
  const [auditFilter, setAuditFilter] = useState('revision_admin'); // 'revision_admin' | 'contrapropuesta' | 'aprobado' | 'all'
  const [isLoadingOffers, setIsLoadingOffers] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [isAuditModalVisible, setIsAuditModalVisible] = useState(false);

  // Campos de formulario para auditoría y calibración de rentabilidad
  const [editOfferName, setEditOfferName] = useState('');
  const [editOfferDesc, setEditOfferDesc] = useState('');
  const [editOfferPoints, setEditOfferPoints] = useState('');
  const [editOfferStock, setEditOfferStock] = useState('');
  const [editAdminNotes, setEditAdminNotes] = useState('');
  const [isSubmittingAudit, setIsSubmittingAudit] = useState(false);

  const scrollViewRef = useRef(null);

  // Cargar ofertas comerciales de Supabase filtrando por estado
  const loadOffersAudit = useCallback(async (filter = auditFilter) => {
    setIsLoadingOffers(true);
    try {
      console.log('[AdminHomeScreen] Consultando ofertas de auditoría con estado:', filter);
      const data = await getOffersPendingAudit(filter);
      console.log(`[AdminHomeScreen] Recibidas ${data?.length || 0} ofertas para '${filter}'`);
      setOffers(data || []);
    } catch (err) {
      console.error('[AdminHomeScreen] Error al consultar ofertas comerciales:', err);
    } finally {
      setIsLoadingOffers(false);
    }
  }, [auditFilter]);

  const handleExportReport = async () => {
    setIsExporting(true);
    try {
      const result = await generateAdminReportCSV();
      Alert.alert(
        '✅ Reporte Generado',
        `Se procesaron ${result.totalRecolecciones} recolecciones y ${result.totalCanjes} canjes.\n\nEl archivo CSV está listo para compartirse o abrirse en Microsoft Excel.`
      );
    } catch (err) {
      console.error('[AdminHome] Error al exportar reporte:', err);
      Alert.alert(
        'Error al Exportar',
        err.message || 'Ocurrió un error al generar o compartir el archivo de reporte.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  const loadMetrics = useCallback(async (isPullToRefresh = false) => {
    if (isPullToRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const [data, remoteRoutes] = await Promise.all([
        getGlobalMetrics(),
        getRoutes().catch((e) => {
          console.warn('[AdminHome] Error al consultar rutas de Supabase:', e);
          return [];
        }),
      ]);
      setMetrics(data);
      setRoutes(remoteRoutes || []);
    } catch (err) {
      console.warn('[AdminHome] Error al cargar métricas:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
    loadOffersAudit('revision_admin');
    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadMetrics();
      loadOffersAudit(auditFilter || 'revision_admin');
    });
    return unsubscribe;
  }, [navigation, loadMetrics, loadOffersAudit, auditFilter]);

  // Apertura del modal de auditoría para una propuesta
  const openAuditModal = (offer) => {
    setSelectedOffer(offer);
    setEditOfferName(offer.nombre || '');
    setEditOfferDesc(offer.descripcion || '');
    setEditOfferPoints(
      offer.puntos_requeridos
        ? String(offer.puntos_requeridos)
        : offer.costo_puntos
        ? String(offer.costo_puntos)
        : '50'
    );
    setEditOfferStock(
      offer.stock !== undefined && offer.stock !== null ? String(offer.stock) : '25'
    );
    setEditAdminNotes(offer.notas_admin || '');
    setIsAuditModalVisible(true);
  };

  // Ejecución de la decisión gerencial (Aprobar, Contrapropuesta o Rechazar)
  const handleAuditDecision = (action) => {
    if (!selectedOffer) return;

    if (!editOfferName.trim()) {
      Alert.alert('Campo Requerido', 'El nombre de la oferta no puede quedar vacío.');
      return;
    }
    if (!editOfferDesc.trim()) {
      Alert.alert('Campo Requerido', 'La descripción no puede quedar vacía.');
      return;
    }
    const pointsNum = parseInt(editOfferPoints, 10);
    if (isNaN(pointsNum) || pointsNum <= 0) {
      Alert.alert(
        'Puntos Inválidos',
        'Ingresa un valor numérico mayor a 0 para los puntos requeridos para garantizar la rentabilidad.'
      );
      return;
    }
    const stockNum = parseInt(editOfferStock, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      Alert.alert('Stock Inválido', 'Ingresa un stock numérico igual o mayor a 0.');
      return;
    }

    if (action === 'contrapropuesta' && !editAdminNotes.trim()) {
      Alert.alert(
        'Notas de Gerencia Requeridas',
        'Para enviar una contrapropuesta, ingresa en "Notas del Administrador" la explicación o ajuste requerido al afiliado (Ej: "Ajustamos los puntos a 50 para mantener margen").'
      );
      return;
    }

    let confirmTitle = '';
    let confirmMsg = '';

    if (action === 'aprobar') {
      confirmTitle = '✅ ¿Aprobar Directamente?';
      confirmMsg = `La oferta "${editOfferName.trim()}" quedará aprobada con ${pointsNum} puntos y pasará a estar activa inmediatamente para los vecinos en la app.\n\nComercio: ${
        selectedOffer.comercio || 'Afiliado'
      }`;
    } else if (action === 'contrapropuesta') {
      confirmTitle = '🟠 ¿Enviar Contrapropuesta?';
      confirmMsg = `Se guardará el estado 'contrapropuesta' con ${pointsNum} puntos y las notas gerenciales:\n\n"${editAdminNotes.trim()}"\n\nEl comercio deberá aceptar los cambios antes de su publicación a los clientes.`;
    } else if (action === 'rechazar') {
      confirmTitle = '🔴 ¿Rechazar Oferta?';
      confirmMsg = `La oferta "${editOfferName.trim()}" quedará rechazada e inactiva.`;
    }

    Alert.alert(confirmTitle, confirmMsg, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text:
          action === 'aprobar'
            ? 'Sí, Aprobar Oferta'
            : action === 'contrapropuesta'
            ? 'Sí, Enviar Contrapropuesta'
            : 'Sí, Rechazar',
        style: action === 'rechazar' ? 'destructive' : 'default',
        onPress: async () => {
          setIsSubmittingAudit(true);
          try {
            await auditCommercialOffer({
              offerId: selectedOffer.id,
              action,
              nombre: editOfferName,
              descripcion: editOfferDesc,
              costoPuntos: pointsNum,
              stock: stockNum,
              notasAdmin: editAdminNotes,
            });

            await Promise.all([loadOffersAudit(auditFilter), loadMetrics()]);

            setIsAuditModalVisible(false);
            setSelectedOffer(null);

            Alert.alert(
              action === 'aprobar'
                ? '🎉 ¡Oferta Aprobada!'
                : action === 'contrapropuesta'
                ? '📤 Contrapropuesta Enviada'
                : 'Oferta Rechazada',
              action === 'aprobar'
                ? `La oferta ha sido aprobada y activada con éxito. Ya es visible en el catálogo de los clientes.`
                : action === 'contrapropuesta'
                ? `La contrapropuesta se guardó con éxito en Supabase. El comercio afiliado la visualizará en su pestaña 'Mis Ofertas' para su aceptación.`
                : `La propuesta comercial ha sido marcada como rechazada.`
            );
          } catch (err) {
            console.error('[AdminHome] Error en auditoría comercial:', err);
            Alert.alert(
              'Error en Auditoría',
              err.message || 'No se pudo guardar la decisión en Supabase.'
            );
          } finally {
            setIsSubmittingAudit(false);
          }
        },
      },
    ]);
  };

  const getOfferStatusBadge = (status) => {
    switch (status) {
      case 'aprobado':
        return {
          label: '🟢 Aprobado',
          bg: '#DCFCE7',
          color: '#166534',
          border: '#BBF7D0',
        };
      case 'contrapropuesta':
        return {
          label: '🟠 Contrapropuesta',
          bg: '#FFEDD5',
          color: '#C2410C',
          border: '#FED7AA',
        };
      case 'rechazado':
        return {
          label: '🔴 Rechazado',
          bg: '#FEE2E2',
          color: '#991B1B',
          border: '#FECACA',
        };
      case 'revision_admin':
      default:
        return {
          label: '🟡 En Revisión',
          bg: '#FEF3C7',
          color: '#92400E',
          border: '#FDE68A',
        };
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              loadMetrics(true);
              loadOffersAudit(auditFilter || 'revision_admin');
            }}
            colors={[THEME.roles.admin]}
            tintColor={THEME.roles.admin}
          />
        }
      >
        {/* Banner Superior con Rol y Logout */}
        <View style={styles.badgeRow}>
          <View style={[styles.roleTag, { backgroundColor: THEME.roles.admin }]}>
            <Text style={styles.roleTagText}>⚙️ Rol: Administrador EcoRuta</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutBtnText}>Cerrar Sesión</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.welcomeText}>Panel Gerencial: {profile?.nombre_completo || 'Administrador'}</Text>
        <Text style={styles.deptText}>
          {profile?.departamento || 'Gestión y Operaciones • EcoRuta Palín'}
        </Text>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={THEME.roles.admin} />
            <Text style={styles.loadingText}>Calculando métricas del servicio...</Text>
          </View>
        ) : (
          <>
            {/* 1. Tarjeta Hero de Impacto Ambiental */}
            <View style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <Text style={styles.heroLabel}>IMPACTO AMBIENTAL ACUMULADO</Text>
                <View style={styles.heroBadge}>
                  <Text style={styles.heroBadgeText}>Palín Limpio</Text>
                </View>
              </View>
              <Text style={styles.heroNumber}>{metrics.totalKg.toLocaleString()} kg</Text>
              <Text style={styles.heroSubtext}>
                Total de residuos reciclables recolectados y recuperados en Palín.
              </Text>

              <View style={styles.heroStatsRow}>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatValue}>{metrics.totalRecolecciones}</Text>
                  <Text style={styles.heroStatLabel}>Entregas Totales</Text>
                </View>
                <View style={styles.heroDivider} />
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatValue}>{metrics.totalClientes}</Text>
                  <Text style={styles.heroStatLabel}>Vecinos Activos</Text>
                </View>
                <View style={styles.heroDivider} />
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatValue}>
                    {metrics.totalKg > 0 ? (metrics.totalKg / 1000).toFixed(2) : '0'} T
                  </Text>
                  <Text style={styles.heroStatLabel}>Toneladas Métricas</Text>
                </View>
              </View>
            </View>

            {/* 2. Grid de KPIs Secundarios */}
            <View style={styles.kpiGrid}>
              {/* KPI: Puntos Otorgados */}
              <View style={styles.kpiCard}>
                <View style={styles.kpiIconBadge}>
                  <Text style={styles.kpiIcon}>⭐</Text>
                </View>
                <Text style={styles.kpiValue}>{metrics.totalPuntos.toLocaleString()} pts</Text>
                <Text style={styles.kpiTitle}>Puntos Otorgados</Text>
                <Text style={styles.kpiDesc}>Incentivos acreditados a la ciudadanía</Text>
              </View>

              {/* KPI: Canjes Pendientes (Interactivo hacia la pestaña de aprobación) */}
              <TouchableOpacity
                style={[
                  styles.kpiCard,
                  metrics.pendingCanjes > 0 && styles.kpiCardAlert,
                ]}
                onPress={() => navigation?.navigate?.('AdminRewards')}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.kpiIconBadge,
                    metrics.pendingCanjes > 0 ? { backgroundColor: '#FEF3C7' } : {},
                  ]}
                >
                  <Text style={styles.kpiIcon}>🎁</Text>
                </View>
                <Text
                  style={[
                    styles.kpiValue,
                    metrics.pendingCanjes > 0 ? { color: '#B45309' } : {},
                  ]}
                >
                  {metrics.pendingCanjes}
                </Text>
                <Text style={styles.kpiTitle}>Canjes Pendientes</Text>
                <Text style={styles.kpiDesc}>
                  {metrics.pendingCanjes > 0
                    ? 'Toca para revisar y aprobar entregas →'
                    : 'Sin solicitudes pendientes'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* KPI Banner Interactivo: Auditoría de Ofertas Comerciales */}
            <TouchableOpacity
              style={[
                styles.auditKpiBanner,
                (metrics.pendingOfferAudits > 0 || offers.some(o => o.estado_aprobacion === 'revision_admin')) &&
                  styles.auditKpiBannerAlert,
              ]}
              onPress={() => {
                setAuditFilter('revision_admin');
                loadOffersAudit('revision_admin');
              }}
              activeOpacity={0.85}
            >
              <View style={styles.auditKpiLeft}>
                <View style={styles.auditKpiBadge}>
                  <Text style={styles.auditKpiIcon}>📢</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.auditKpiTitle}>Auditoría de Ofertas Comerciales</Text>
                  <Text style={styles.auditKpiSubtitle}>
                    Propuestas de comercios afiliados por calibrar márgenes y aprobar
                  </Text>
                </View>
              </View>
              <View style={styles.auditKpiCountPill}>
                <Text style={styles.auditKpiCountText}>
                  {metrics.pendingOfferAudits || offers.filter(o => o.estado_aprobacion === 'revision_admin').length} por auditar
                </Text>
              </View>
            </TouchableOpacity>

            {/* ── SECCIÓN: AUDITORÍA DE COMERCIOS (GERENCIA ECORUTA) ───────── */}
            <View style={styles.auditSectionCard}>
              <View style={styles.auditHeaderRow}>
                <View style={{ flex: 1 }}>
                  <View style={styles.auditTitleWithBadge}>
                    <Text style={styles.auditSectionTitle}>📢 Auditoría de Comercios</Text>
                    {offers.filter((o) => o.estado_aprobacion === 'revision_admin').length > 0 && (
                      <View style={styles.pendingBadgeAlert}>
                        <Text style={styles.pendingBadgeAlertText}>
                          {offers.filter((o) => o.estado_aprobacion === 'revision_admin').length} pendientes
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.auditSectionSubtitle}>
                    Consulta convenios en catalogo_incentivos, ajusta puntos para rentabilidad y envía contrapropuestas.
                  </Text>
                </View>
              </View>

              {/* Filtros de Auditoría */}
              <View style={styles.filterChipsRow}>
                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    auditFilter === 'revision_admin' && styles.filterChipActive,
                  ]}
                  onPress={() => {
                    setAuditFilter('revision_admin');
                    loadOffersAudit('revision_admin');
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      auditFilter === 'revision_admin' && styles.filterChipTextActive,
                    ]}
                  >
                    🟡 En Revisión
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    auditFilter === 'contrapropuesta' && styles.filterChipActive,
                  ]}
                  onPress={() => {
                    setAuditFilter('contrapropuesta');
                    loadOffersAudit('contrapropuesta');
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      auditFilter === 'contrapropuesta' && styles.filterChipTextActive,
                    ]}
                  >
                    🟠 Contrapropuesta
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    auditFilter === 'aprobado' && styles.filterChipActive,
                  ]}
                  onPress={() => {
                    setAuditFilter('aprobado');
                    loadOffersAudit('aprobado');
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      auditFilter === 'aprobado' && styles.filterChipTextActive,
                    ]}
                  >
                    🟢 Aprobadas
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    auditFilter === 'all' && styles.filterChipActive,
                  ]}
                  onPress={() => {
                    setAuditFilter('all');
                    loadOffersAudit('all');
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      auditFilter === 'all' && styles.filterChipTextActive,
                    ]}
                  >
                    📋 Todas
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Listado de Ofertas para Auditoría */}
              {isLoadingOffers ? (
                <View style={styles.offersLoadingBox}>
                  <ActivityIndicator size="small" color={THEME.roles.admin} />
                  <Text style={styles.offersLoadingText}>
                    Consultando catalogo_incentivos en Supabase...
                  </Text>
                </View>
              ) : offers.length === 0 ? (
                <View style={styles.offersEmptyBox}>
                  <Text style={styles.offersEmptyIcon}>
                    {auditFilter === 'revision_admin' ? '✨' : '📭'}
                  </Text>
                  <Text style={styles.offersEmptyTitle}>
                    {auditFilter === 'revision_admin'
                      ? 'Sin ofertas pendientes de revisión'
                      : 'No hay ofertas con este estado'}
                  </Text>
                  <Text style={styles.offersEmptySub}>
                    {auditFilter === 'revision_admin'
                      ? 'Todas las propuestas comerciales de comercios afiliados han sido auditadas.'
                      : 'Selecciona la pestaña "🟡 En Revisión" o "📋 Todas" para examinar otras propuestas.'}
                  </Text>
                </View>
              ) : (
                offers.map((offer) => {
                  const badge = getOfferStatusBadge(offer.estado_aprobacion);
                  return (
                    <TouchableOpacity
                      key={offer.id?.toString() || Math.random().toString()}
                      style={styles.offerAuditCard}
                      onPress={() => openAuditModal(offer)}
                      activeOpacity={0.85}
                    >
                      {/* Cabecera de la Oferta */}
                      <View style={styles.offerCardTop}>
                        <View style={styles.merchantTag}>
                          <Text style={styles.merchantIcon}>🏪</Text>
                          <Text style={styles.merchantName} numberOfLines={1}>
                            {offer.comercio || 'Comercio Afiliado'}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: badge.bg, borderColor: badge.border },
                          ]}
                        >
                          <Text style={[styles.statusBadgeText, { color: badge.color }]}>
                            {badge.label}
                          </Text>
                        </View>
                      </View>

                      {/* Nombre y Descripción */}
                      <Text style={styles.offerCardTitle}>{offer.nombre}</Text>
                      <Text style={styles.offerCardDesc} numberOfLines={2}>
                        {offer.descripcion}
                      </Text>

                      {/* Puntos y Stock */}
                      <View style={styles.offerCardMetrics}>
                        <View style={styles.pointsPill}>
                          <Text style={styles.pointsPillText}>
                            ⭐ {offer.puntos_requeridos ?? offer.costo_puntos} pts
                          </Text>
                        </View>
                        <View style={styles.stockPill}>
                          <Text style={styles.stockPillText}>📦 Stock: {offer.stock}</Text>
                        </View>
                        {Boolean(offer.categoria) && (
                          <View style={styles.categoryPill}>
                            <Text style={styles.categoryPillText}>🏷️ {offer.categoria}</Text>
                          </View>
                        )}
                        {Boolean(offer.tipo_promocion) && (
                          <View style={styles.promoPill}>
                            <Text style={styles.promoPillText}>
                              {offer.tipo_promocion.includes('%')
                                ? '📉'
                                : offer.tipo_promocion.includes('2x1')
                                ? '🎁'
                                : '💰'}{' '}
                              {offer.tipo_promocion}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Notas de Administrador previas si existen */}
                      {Boolean(offer.notas_admin) && (
                        <View style={styles.adminNotesCallout}>
                          <Text style={styles.adminNotesCalloutLabel}>📝 Notas Gerencia:</Text>
                          <Text style={styles.adminNotesCalloutText} numberOfLines={2}>
                            {offer.notas_admin}
                          </Text>
                        </View>
                      )}

                      {/* Botón de Acción */}
                      <View style={styles.cardActionRow}>
                        <View style={styles.auditCardBtn}>
                          <Text style={styles.auditCardBtnText}>
                            ✏️ Auditar y Calibrar Propuesta →
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            {/* 3. Desglose de Materiales Recolectados */}
            <View style={styles.breakdownCard}>
              <Text style={styles.breakdownTitle}>📊 Distribución por Material</Text>
              <Text style={styles.breakdownSubtitle}>
                Kilogramos procesados por tipo de residuo en Palín
              </Text>

              <View style={styles.materialRow}>
                <View style={styles.materialCol}>
                  <Text style={styles.matIcon}>🧴</Text>
                  <Text style={styles.matLabel}>Plástico (PET)</Text>
                  <Text style={styles.matValue}>{metrics.materialStats?.plastico || 0} kg</Text>
                </View>
                <View style={styles.materialCol}>
                  <Text style={styles.matIcon}>📦</Text>
                  <Text style={styles.matLabel}>Cartón / Papel</Text>
                  <Text style={styles.matValue}>{metrics.materialStats?.carton || 0} kg</Text>
                </View>
              </View>

              <View style={[styles.materialRow, { marginTop: 12 }]}>
                <View style={styles.materialCol}>
                  <Text style={styles.matIcon}>🥫</Text>
                  <Text style={styles.matLabel}>Aluminio</Text>
                  <Text style={styles.matValue}>{metrics.materialStats?.aluminio || 0} kg</Text>
                </View>
                <View style={styles.materialCol}>
                  <Text style={styles.matIcon}>🍾</Text>
                  <Text style={styles.matLabel}>Vidrio</Text>
                  <Text style={styles.matValue}>{metrics.materialStats?.vidrio || 0} kg</Text>
                </View>
              </View>
            </View>

            {/* 4. Rutas y Monitoreo EcoRuta */}
            <View style={styles.routesCard}>
              <Text style={styles.routesTitle}>🚛 Rutas de Recolección en Operación</Text>
              {routes.length === 0 ? (
                <View style={styles.emptyRoutesBox}>
                  <Text style={styles.emptyRoutesText}>
                    No hay rutas de recolección registradas en Supabase.
                  </Text>
                </View>
              ) : (
                routes.map((route, idx) => (
                  <View
                    key={route.id?.toString() || idx}
                    style={[styles.routeItem, idx > 0 && { marginTop: 8 }]}
                  >
                    <Text style={styles.routeBullet}>🟢</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.routeName}>{route.nombre}</Text>
                      <Text style={styles.routeSub}>
                        {route.descripcion || 'Sector territorial de recolección en Palín'}
                      </Text>
                    </View>
                    <Text style={styles.routeStatus}>Activa</Text>
                  </View>
                ))
              )}
            </View>

            {/* 5. Exportación de Reportes Gerenciales (Excel / CSV) */}
            <View style={styles.exportCard}>
              <View style={styles.exportHeader}>
                <View style={styles.exportIconBadge}>
                  <Text style={styles.exportIcon}>📑</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exportTitle}>Reportes Oficiales y Auditoría</Text>
                  <Text style={styles.exportSubtitle}>
                    Descarga el consolidado de recolecciones, operarios y canjes para análisis en Excel.
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.exportButton, isExporting && styles.exportButtonDisabled]}
                onPress={handleExportReport}
                disabled={isExporting}
                activeOpacity={0.85}
              >
                {isExporting ? (
                  <View style={styles.buttonLoadingRow}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.exportButtonText}> Generando reporte CSV...</Text>
                  </View>
                ) : (
                  <View style={styles.buttonLoadingRow}>
                    <Text style={styles.exportButtonIcon}>📊</Text>
                    <Text style={styles.exportButtonText}>Exportar Reporte Excel / CSV</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {/* ── MODAL: AUDITORÍA Y CALIBRACIÓN DE OFERTA COMERCIAL ────────────── */}
      <Modal
        visible={isAuditModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          if (!isSubmittingAudit) setIsAuditModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContainer}>
            {/* Cabecera del Modal */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalHeaderTag}>AUDITORÍA COMERCIAL • GERENCIA ECORUTA</Text>
                <Text style={styles.modalHeaderTitle}>Calibrar Propuesta</Text>
                <Text style={styles.modalHeaderSub}>
                  Comercio: {selectedOffer?.comercio || 'Afiliado'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsAuditModalVisible(false)}
                disabled={isSubmittingAudit}
              >
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={{ paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Estado actual en Supabase */}
              {selectedOffer && (
                <View style={styles.modalStatusBanner}>
                  <Text style={styles.modalStatusLabel}>Estado actual en Supabase:</Text>
                  <Text style={styles.modalStatusValue}>
                    {selectedOffer.estado_aprobacion === 'revision_admin'
                      ? '🟡 En Revisión Inicial'
                      : selectedOffer.estado_aprobacion === 'contrapropuesta'
                      ? '🟠 Contrapropuesta Pendiente'
                      : selectedOffer.estado_aprobacion === 'aprobado'
                      ? '🟢 Aprobada y Activa'
                      : '🔴 Rechazada'}
                  </Text>
                </View>
              )}

              {/* Campo: Nombre de la Oferta */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Título de la Oferta o Beneficio:</Text>
                <TextInput
                  style={styles.inputField}
                  value={editOfferName}
                  onChangeText={setEditOfferName}
                  placeholder="Ej. 15% Descuento en Canasta Básica"
                  placeholderTextColor="#94A3B8"
                  editable={!isSubmittingAudit}
                />
              </View>

              {/* Campo: Descripción */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Descripción y Condiciones del Descuento:</Text>
                <TextInput
                  style={[styles.inputField, styles.textAreaField]}
                  value={editOfferDesc}
                  onChangeText={setEditOfferDesc}
                  placeholder="Detalles del beneficio canjeable..."
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={3}
                  editable={!isSubmittingAudit}
                />
              </View>

              {/* Fila: Puntos Requeridos y Stock */}
              <View style={styles.twoInputsRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>⭐ Puntos Requeridos:</Text>
                  <TextInput
                    style={[styles.inputField, styles.highlightPointsInput]}
                    value={editOfferPoints}
                    onChangeText={setEditOfferPoints}
                    placeholder="Ej. 50"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    editable={!isSubmittingAudit}
                  />
                  <Text style={styles.inputHint}>
                    💡 Calibra los puntos para asegurar la rentabilidad de EcoRuta.
                  </Text>
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>📦 Stock Disponible:</Text>
                  <TextInput
                    style={styles.inputField}
                    value={editOfferStock}
                    onChangeText={setEditOfferStock}
                    placeholder="Ej. 25"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    editable={!isSubmittingAudit}
                  />
                  <Text style={styles.inputHint}>
                    Unidades máximas a canjear en tienda.
                  </Text>
                </View>
              </View>

              {/* Campo: Notas del Administrador (notas_admin) */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  📝 Notas del Administrador (notas_admin):
                </Text>
                <TextInput
                  style={[styles.inputField, styles.textAreaField, styles.notesAdminField]}
                  value={editAdminNotes}
                  onChangeText={setEditAdminNotes}
                  placeholder="Ej: Ajustamos los puntos a 50 para mantener margen"
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={3}
                  editable={!isSubmittingAudit}
                />
                <Text style={styles.inputHint}>
                  Obligatorio al enviar contrapropuesta. El comercio afiliado leerá estas notas en su panel.
                </Text>
              </View>

              {/* Botones de Decisión Gerencial */}
              <View style={styles.decisionActions}>
                {/* 1. Botón: Aprobar Directamente */}
                <TouchableOpacity
                  style={[styles.approveDirectBtn, isSubmittingAudit && styles.btnDisabled]}
                  onPress={() => handleAuditDecision('aprobar')}
                  disabled={isSubmittingAudit}
                  activeOpacity={0.85}
                >
                  {isSubmittingAudit ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.decisionBtnIcon}>✅</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.decisionBtnMainText}>Aprobar Directamente</Text>
                        <Text style={styles.decisionBtnSubText}>
                          Publicar de inmediato con estado 'aprobado'
                        </Text>
                      </View>
                    </>
                  )}
                </TouchableOpacity>

                {/* 2. Botón: Enviar Contrapropuesta */}
                <TouchableOpacity
                  style={[styles.counterProposalBtn, isSubmittingAudit && styles.btnDisabled]}
                  onPress={() => handleAuditDecision('contrapropuesta')}
                  disabled={isSubmittingAudit}
                  activeOpacity={0.85}
                >
                  {isSubmittingAudit ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.decisionBtnIcon}>💬</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.decisionBtnMainText}>Enviar Contrapropuesta</Text>
                        <Text style={styles.decisionBtnSubText}>
                          Guarda notas_admin y estado 'contrapropuesta' para aceptación del comercio
                        </Text>
                      </View>
                    </>
                  )}
                </TouchableOpacity>

                {/* 3. Botón: Rechazar Oferta */}
                <TouchableOpacity
                  style={[styles.rejectOfferBtn, isSubmittingAudit && styles.btnDisabled]}
                  onPress={() => handleAuditDecision('rechazar')}
                  disabled={isSubmittingAudit}
                  activeOpacity={0.85}
                >
                  <Text style={styles.rejectOfferBtnText}>✕ Rechazar Oferta</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  content: {
    padding: 20,
    paddingBottom: 28,
    ...(Platform.OS === 'web' && {
      maxWidth: 1200,
      width: '100%',
      alignSelf: 'center',
    }),
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  roleTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  roleTagText: {
    color: '#FFFFFF',
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
    fontWeight: '600',
    fontSize: 12,
  },
  welcomeText: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  deptText: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 4,
    marginBottom: 18,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    marginTop: 12,
    fontWeight: '600',
  },
  heroCard: {
    backgroundColor: '#5B21B6', // Púrpura gerencial profundo
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#5B21B6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DDD6FE',
    letterSpacing: 0.8,
  },
  heroBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  heroBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  heroNumber: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 6,
  },
  heroSubtext: {
    fontSize: 12,
    color: '#EDE9FE',
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 16,
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: 'space-between',
  },
  heroStat: {
    alignItems: 'center',
    flex: 1,
  },
  heroStatValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  heroStatLabel: {
    color: '#DDD6FE',
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
  },
  heroDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: THEME.colors.surface,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  kpiCardAlert: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  kpiIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  kpiIcon: {
    fontSize: 20,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  kpiTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  kpiDesc: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 4,
    lineHeight: 14,
  },
  breakdownCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  breakdownTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  breakdownSubtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
    marginBottom: 14,
  },
  materialRow: {
    flexDirection: 'row',
    gap: 12,
  },
  materialCol: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  matIcon: {
    fontSize: 20,
  },
  matLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
    marginTop: 4,
  },
  matValue: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  routesCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  routesTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 12,
  },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
  },
  routeBullet: {
    fontSize: 12,
    marginRight: 10,
  },
  routeName: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  routeSub: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  routeStatus: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginLeft: 6,
  },
  exportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#F5F3FF',
    shadowColor: THEME.roles.admin,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    marginTop: 4,
    marginBottom: 16,
  },
  exportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  exportIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  exportIcon: {
    fontSize: 22,
  },
  exportTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#4C1D95',
  },
  exportSubtitle: {
    fontSize: 12,
    color: '#6D28D9',
    marginTop: 2,
    lineHeight: 16,
  },
  exportButton: {
    backgroundColor: THEME.roles.admin,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: THEME.roles.admin,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  exportButtonDisabled: {
    opacity: 0.7,
  },
  buttonLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportButtonIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  exportButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  emptyRoutesBox: {
    padding: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyRoutesText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
  },

  // ─── ESTILOS PARA AUDITORÍA DE OFERTAS COMERCIALES ───────────────────────
  auditKpiBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  auditKpiBannerAlert: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  auditKpiLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  auditKpiBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  auditKpiIcon: {
    fontSize: 20,
  },
  auditKpiTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  auditKpiSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  auditKpiCountPill: {
    backgroundColor: '#D97706',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  auditKpiCountText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },

  auditSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  auditHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  auditTitleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  auditSectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  pendingBadgeAlert: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  pendingBadgeAlertText: {
    color: '#92400E',
    fontSize: 11,
    fontWeight: '800',
  },
  auditSectionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 17,
  },

  filterChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#1E293B',
    borderColor: '#1E293B',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  offersLoadingBox: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offersLoadingText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 8,
  },

  offersEmptyBox: {
    padding: 24,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  offersEmptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  offersEmptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
  },
  offersEmptySub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },

  offerAuditCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  offerCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  merchantTag: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  merchantIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  merchantName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  offerCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  offerCardDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 10,
  },
  offerCardMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  pointsPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  pointsPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
  },
  stockPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  stockPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  categoryPill: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6D28D9',
  },
  promoPill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  promoPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  adminNotesCallout: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#D97706',
  },
  adminNotesCalloutLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 2,
  },
  adminNotesCalloutText: {
    fontSize: 11,
    color: '#78350F',
    lineHeight: 15,
  },
  cardActionRow: {
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
  },
  auditCardBtn: {
    alignItems: 'flex-end',
  },
  auditCardBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.roles.admin,
  },

  // ─── ESTILOS DEL MODAL DE AUDITORÍA ──────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingHorizontal: 20,
    paddingTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderTag: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.roles.admin,
    letterSpacing: 0.8,
  },
  modalHeaderTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  modalHeaderSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
  },
  modalBody: {
    paddingTop: 16,
  },
  modalStatusBanner: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalStatusLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  modalStatusValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },

  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  inputField: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  textAreaField: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  twoInputsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  highlightPointsInput: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
    fontWeight: '800',
    color: '#92400E',
    fontSize: 16,
  },
  notesAdminField: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  inputHint: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 14,
  },

  decisionActions: {
    marginTop: 10,
    gap: 10,
  },
  approveDirectBtn: {
    backgroundColor: '#059669', // Verde esmeralda gerencial
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  counterProposalBtn: {
    backgroundColor: '#D97706', // Ámbar/naranja de contrapropuesta
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  decisionBtnIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  decisionBtnMainText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  decisionBtnSubText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 10,
    marginTop: 2,
  },
  rejectOfferBtn: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectOfferBtnText: {
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});

