import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
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

  // Material helpers para renderizado de íconos y nombres amigables
  const getMaterialDetails = (tipo) => {
    const key = (tipo || '').toLowerCase();
    if (key.includes('separad') && !key.includes('no')) return { name: 'Residuos Separados', icon: '♻️', color: '#059669' };
    if (key.includes('no_separad') || key.includes('no separad')) return { name: 'Residuos No Separados', icon: '🚫', color: '#DC2626' };
    if (key.includes('plast')) return { name: 'Plástico (PET)', icon: '🧴', color: '#0284C7' };
    if (key.includes('cart') || key.includes('papel')) return { name: 'Cartón y Papel', icon: '📦', color: '#D97706' };
    if (key.includes('alum') || key.includes('metal')) return { name: 'Aluminio / Latas', icon: '🥫', color: '#DC2626' };
    if (key.includes('vidr')) return { name: 'Vidrio', icon: '🍾', color: '#059669' };
    return { name: tipo || 'Reciclaje Mixto', icon: '♻️', color: THEME.colors.primary };
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

  // Carga de datos 100% reales desde Supabase
  const loadData = useCallback(async (isPullToRefresh = false) => {
    if (isPullToRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      if (user?.id) {
        // 1. Consultar saldo actualizado en `perfiles`
        try {
          const updatedProfile = await getClientProfile(user.id);
          if (updatedProfile) {
            const currentBalance =
              updatedProfile.puntos_reciclaje ?? updatedProfile.puntos_acumulados ?? 0;
            setPoints(currentBalance);
          }
        } catch (profileErr) {
          console.warn('[ClientHome] Error al refrescar perfil:', profileErr.message);
        }

        // 2. Consultar historial real en `historial_recolecciones`
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

  // Cabecera del Listado (Hero Card + Código QR Real + Saldo)
  const renderHeader = () => {
    const totalKg = collections.reduce((acc, curr) => acc + (parseFloat(curr.peso_kg) || 0), 0);
    const userIdReal = user?.id || '';
    const qrUrl = userIdReal
      ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(userIdReal)}&margin=10`
      : null;

    return (
      <View style={styles.headerContainer}>
        {/* Barra Superior con Rol y Cerrar Sesión */}
        <View style={styles.badgeRow}>
          <View style={[styles.roleTag, { backgroundColor: THEME.roles.cliente }]}>
            <Text style={styles.roleTagText}>🌱 Rol: Ciudadano / Cliente</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutBtnText}>Cerrar Sesión</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.welcomeText}>¡Hola, {profile?.nombre_completo || 'Vecino'}!</Text>
        <Text style={styles.addressText}>📍 {profile?.direccion || 'Palín, Escuintla'}</Text>

        {/* Tarjeta de Código QR Real del Ciudadano */}
        <View style={styles.qrCard}>
          <View style={styles.qrHeader}>
            <Text style={styles.qrBadgeText}>🏷️ TU CÓDIGO QR PERSONAL</Text>
            <Text style={styles.qrTitle}>Identificador de Recolección</Text>
            <Text style={styles.qrSubtitle}>
              Muestra este código al operario del camión para que escanee tus bolsas y acredite tus puntos.
            </Text>
          </View>

          <View style={styles.qrImageWrapper}>
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

          <View style={styles.qrFooter}>
            <Text style={styles.qrIdLabel}>ID de Usuario (Supabase):</Text>
            <Text style={styles.qrIdValue} numberOfLines={1} ellipsizeMode="middle">
              {userIdReal || 'No autenticado'}
            </Text>
          </View>
        </View>

        {/* Tarjeta Destacada de Saldo de Puntos */}
        <View style={styles.pointsCard}>
          <View style={styles.pointsCardTop}>
            <Text style={styles.pointsLabel}>SALDO DE ECO-PUNTOS</Text>
            <View style={styles.liveTag}>
              <Text style={styles.liveTagDot}>•</Text>
              <Text style={styles.liveTagText}>En Vivo</Text>
            </View>
          </View>
          <Text style={styles.pointsNumber}>{points} pts</Text>
          <Text style={styles.pointsHint}>
            Acumulados por separar tus residuos en Palín
          </Text>

          {/* Accesos rápidos dentro de la tarjeta */}
          <View style={styles.pointsStatsRow}>
            <View style={styles.pointsStat}>
              <Text style={styles.pointsStatNumber}>{collections.length}</Text>
              <Text style={styles.pointsStatLabel}>Entregas</Text>
            </View>
            <View style={styles.pointsDivider} />
            <View style={styles.pointsStat}>
              <Text style={styles.pointsStatNumber}>
                {collections.filter((c) => c.separado === 1 || c.puntos_otorgados > 0).length}
              </Text>
              <Text style={styles.pointsStatLabel}>Separadas</Text>
            </View>
            <View style={styles.pointsDivider} />
            <TouchableOpacity
              style={styles.pointsCatalogBtn}
              onPress={() => navigation?.navigate?.('ClientRewards')}
            >
              <Text style={styles.pointsCatalogBtnText}>Canjear 🎁</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Título de la sección de Historial */}
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>📋 Historial de Entregas</Text>
          <Text style={styles.sectionSubtitle}>
            {collections.length} registro(s) en Supabase
          </Text>
        </View>
      </View>
    );
  };

  // Render de cada tarjeta de recolección en la lista
  const renderCollectionItem = ({ item }) => {
    const mat = getMaterialDetails(item.tipo_material);

    return (
      <View style={styles.historyCard}>
        <View style={[styles.materialIconBadge, { backgroundColor: mat.color + '15' }]}>
          <Text style={styles.materialIcon}>{mat.icon}</Text>
        </View>
        <View style={styles.historyInfo}>
          <Text style={styles.historyMaterialName}>{mat.name}</Text>
          <Text style={styles.historyDate}>{formatDate(item.fecha_recoleccion)}</Text>
          {item.peso_kg > 0 ? (
            <Text style={styles.historyWeight}>Peso: {item.peso_kg} kg</Text>
          ) : (
            <Text style={styles.historyWeight}>
              {item.puntos_otorgados > 0 ? 'Residuo clasificado' : 'Sin clasificar'}
            </Text>
          )}
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
  };

  return (
    <SafeAreaView style={styles.container}>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={THEME.colors.primary} />
          <Text style={styles.loadingText}>Cargando tu historial de reciclaje...</Text>
        </View>
      ) : (
        <FlatList
          data={collections}
          keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
          ListHeaderComponent={renderHeader}
          renderItem={renderCollectionItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadData(true)}
              colors={[THEME.colors.primary]}
              tintColor={THEME.colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🚛</Text>
              <Text style={styles.emptyTitle}>Sin entregas registradas aún</Text>
              <Text style={styles.emptyDesc}>
                Cuando el camión recolector pase por tu sector en Palín y escanee tu código QR, tus entregas y puntos acumulados se reflejarán aquí en tiempo real.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
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
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  headerContainer: {
    paddingTop: 16,
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
    fontSize: 24,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  addressText: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 4,
    marginBottom: 16,
  },
  qrCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  qrHeader: {
    alignItems: 'center',
    marginBottom: 14,
  },
  qrBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.primary,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  qrTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  qrSubtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
    paddingHorizontal: 10,
  },
  qrImageWrapper: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    width: 200,
    height: 200,
    marginBottom: 14,
  },
  qrImage: {
    width: 176,
    height: 176,
  },
  qrFooter: {
    alignItems: 'center',
    width: '100%',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  qrIdLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    textTransform: 'uppercase',
  },
  qrIdValue: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  pointsCard: {
    backgroundColor: THEME.colors.primary,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: THEME.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  pointsCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pointsLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ECFDF5',
    letterSpacing: 0.8,
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  liveTagDot: {
    color: '#FFFFFF',
    fontSize: 12,
    marginRight: 4,
  },
  liveTagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  pointsNumber: {
    fontSize: 38,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 6,
  },
  pointsHint: {
    fontSize: 12,
    color: '#D1FAE5',
    marginTop: 4,
    marginBottom: 16,
  },
  pointsStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    justifyContent: 'space-between',
  },
  pointsStat: {
    alignItems: 'center',
  },
  pointsStatNumber: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  pointsStatLabel: {
    color: '#ECFDF5',
    fontSize: 11,
    marginTop: 2,
  },
  pointsDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  pointsCatalogBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  pointsCatalogBtnText: {
    color: THEME.colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surface,
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  materialIconBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  materialIcon: {
    fontSize: 22,
  },
  historyInfo: {
    flex: 1,
  },
  historyMaterialName: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  historyDate: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  historyWeight: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
    marginTop: 2,
  },
  historyPointsBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  historyPointsBadgeZero: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  historyPointsText: {
    color: '#059669',
    fontWeight: '800',
    fontSize: 13,
  },
  historyPointsTextZero: {
    color: '#64748B',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 44,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
