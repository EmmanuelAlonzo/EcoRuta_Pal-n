import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/useAuthStore';
import { THEME } from '../../constants/theme';
import { getAvailableIncentives, getClientProfile, redeemIncentive } from '../../api/client';

export default function RewardsScreen({ navigation }) {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);

  const [incentives, setIncentives] = useState([]);
  const [userPoints, setUserPoints] = useState(
    profile?.puntos_reciclaje ?? profile?.puntos_acumulados ?? 0
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);

  // Carga de catálogo real y saldo del usuario desde Supabase
  const loadIncentives = useCallback(async (isPullToRefresh = false) => {
    if (isPullToRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      // 1. Refrescar saldo del usuario
      if (user?.id) {
        try {
          const updatedProfile = await getClientProfile(user.id);
          if (updatedProfile) {
            setUserPoints(
              updatedProfile.puntos_reciclaje ?? updatedProfile.puntos_acumulados ?? 0
            );
          }
        } catch (profileErr) {
          console.warn('[RewardsScreen] Error refrescando saldo en Supabase:', profileErr.message);
        }
      }

      // 2. Consultar catálogo real desde `catalogo_incentivos`
      const remoteData = await getAvailableIncentives();
      setIncentives(remoteData || []);
    } catch (err) {
      console.error('[RewardsScreen] Error cargando catálogo de Supabase:', err);
      setIncentives([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadIncentives();
    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadIncentives();
    });
    return unsubscribe;
  }, [navigation, loadIncentives]);

  // Lógica de evaluación y ejecución de canje en Supabase
  const handleRedeem = (incentive) => {
    if (isRedeeming) return;

    const cost = incentive.costo_puntos;

    // Validación 1: Puntos insuficientes
    if (userPoints < cost) {
      const missingPoints = cost - userPoints;
      Alert.alert(
        '⚠️ Puntos Insuficientes',
        `Tienes ${userPoints} pts y "${incentive.nombre}" requiere ${cost} pts.\n\nTe faltan ${missingPoints} pts para poder canjearlo. ¡Continúa entregando materiales reciclables en las rutas de Palín para alcanzarlo!`
      );
      return;
    }

    // Validación 2: Confirmación y ejecución
    Alert.alert(
      '🎁 Confirmar Canje',
      `¿Deseas canjear "${incentive.nombre}" por ${cost} puntos?\n\nTu saldo restante será de ${userPoints - cost} pts.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, Canjear',
          style: 'default',
          onPress: async () => {
            setIsRedeeming(true);
            try {
              // Transacción en Supabase: Historial + Débito perfiles + Débito stock
              const result = await redeemIncentive(user?.id, incentive.id, cost);

              const nuevoSaldo = result.nuevoSaldo;
              setUserPoints(nuevoSaldo);

              // Actualizar el perfil en el store de Zustand para que la pantalla Inicio esté sincronizada
              const currentProfile = useAuthStore.getState().profile;
              if (currentProfile) {
                useAuthStore.setState({
                  profile: {
                    ...currentProfile,
                    puntos_reciclaje: nuevoSaldo,
                    puntos_acumulados: nuevoSaldo,
                  },
                });
              }

              // Recargar catálogo y existencias de inmediato desde Supabase
              await loadIncentives();

              Alert.alert(
                '🎉 ¡Canje Exitoso!',
                `¡Felicidades! Has canjeado "${incentive.nombre}".\n\nSe debitaron ${cost} puntos de tu saldo.\nSaldo restante: ${nuevoSaldo} pts.\n\nTu canje se registró con estado 'pendiente'. Puedes reclamarlo en ${
                  incentive.comercio || 'el comercio aliado de Palín'
                }.`
              );
            } catch (err) {
              console.error('[RewardsScreen] Error al procesar canje:', err);
              Alert.alert(
                'No se pudo completar el canje',
                err.message || 'Ocurrió un error al procesar la transacción en Supabase.'
              );
            } finally {
              setIsRedeeming(false);
            }
          },
        },
      ]
    );
  };

  const renderHeader = () => (
    <View style={styles.header}>
      {/* Saldo flotante del vecino */}
      <View style={styles.balanceCard}>
        <View style={styles.balanceInfo}>
          <Text style={styles.balanceLabel}>TUS PUNTOS DISPONIBLES</Text>
          <Text style={styles.balanceNumber}>{userPoints} pts</Text>
          <Text style={styles.balanceHint}>
            Elige un incentivo de los comercios aliados en Palín.
          </Text>
        </View>
        <View style={styles.balanceIconBadge}>
          <Text style={styles.balanceIcon}>⭐</Text>
        </View>
      </View>

      <Text style={styles.catalogTitle}>Catálogo de Recompensas</Text>
      <Text style={styles.catalogSubtitle}>
        Incentivos activos por tu compromiso con el reciclaje en Palín.
      </Text>
    </View>
  );

  const renderIncentiveItem = ({ item }) => {
    const canAfford = userPoints >= item.costo_puntos;

    return (
      <View style={styles.card}>
        <View style={styles.cardTopRow}>
          <View style={styles.cardIconBadge}>
            <Text style={styles.cardIcon}>{item.icono || '🎁'}</Text>
          </View>
          <View style={styles.pointsBadge}>
            <Text style={styles.pointsBadgeText}>⭐ {item.costo_puntos} pts</Text>
          </View>
        </View>

        <Text style={styles.itemTitle}>{item.nombre}</Text>
        <Text style={styles.itemDesc}>{item.descripcion}</Text>

        <View style={styles.merchantRow}>
          <Text style={styles.merchantText}>📍 {item.comercio || 'Comercio Local de Palín'}</Text>
        </View>

        <View style={styles.cardBottomRow}>
          <Text style={styles.stockText}>Stock: {item.stock} disponibles</Text>

          <TouchableOpacity
            style={[
              styles.redeemButton,
              (!canAfford || isRedeeming) && styles.redeemButtonDisabled,
            ]}
            onPress={() => handleRedeem(item)}
            disabled={!canAfford || isRedeeming}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.redeemButtonText,
                (!canAfford || isRedeeming) && styles.redeemButtonTextDisabled,
              ]}
            >
              {canAfford ? 'Canjear' : `Faltan ${item.costo_puntos - userPoints} pts`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={THEME.colors.primary} />
          <Text style={styles.loadingText}>Cargando catálogo de incentivos...</Text>
        </View>
      ) : (
        <FlatList
          data={incentives}
          keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
          ListHeaderComponent={renderHeader}
          renderItem={renderIncentiveItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadIncentives(true)}
              colors={[THEME.colors.primary]}
              tintColor={THEME.colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🎁</Text>
              <Text style={styles.emptyTitle}>No hay incentivos disponibles</Text>
              <Text style={styles.emptyDesc}>
                Pronto se publicarán nuevas recompensas de la municipalidad y comercios de Palín.
              </Text>
            </View>
          }
        />
      )}

      {/* Overlay bloqueante para evitar doble clic durante la transacción en Supabase */}
      {isRedeeming ? (
        <View style={styles.redeemingOverlay}>
          <View style={styles.redeemingBox}>
            <ActivityIndicator size="large" color={THEME.colors.primary} />
            <Text style={styles.redeemingTitle}>Procesando canje...</Text>
            <Text style={styles.redeemingSubtitle}>
              Debitando eco-puntos y reservando tu incentivo en Supabase.
            </Text>
          </View>
        </View>
      ) : null}
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
  header: {
    paddingTop: 16,
    marginBottom: 16,
  },
  balanceCard: {
    backgroundColor: '#065F46', // Verde bosque profundo
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    shadowColor: '#065F46',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  balanceInfo: {
    flex: 1,
  },
  balanceLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#A7F3D0',
    letterSpacing: 0.8,
  },
  balanceNumber: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 4,
  },
  balanceHint: {
    fontSize: 12,
    color: '#D1FAE5',
    marginTop: 4,
  },
  balanceIconBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  balanceIcon: {
    fontSize: 26,
  },
  catalogTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  catalogSubtitle: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 4,
  },
  card: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIcon: {
    fontSize: 22,
  },
  pointsBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  pointsBadgeText: {
    color: '#B45309',
    fontWeight: '800',
    fontSize: 13,
  },
  itemTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 4,
  },
  itemDesc: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  merchantRow: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 14,
  },
  merchantText: {
    fontSize: 11,
    color: '#0F766E',
    fontWeight: '600',
  },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
  },
  stockText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    fontWeight: '500',
  },
  redeemButton: {
    backgroundColor: THEME.colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
  },
  redeemButtonDisabled: {
    backgroundColor: '#E2E8F0',
  },
  redeemButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  redeemButtonTextDisabled: {
    color: '#94A3B8',
    fontWeight: '600',
  },
  redeemingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 999,
  },
  redeemingBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: '85%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  redeemingTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginTop: 14,
  },
  redeemingSubtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
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
  },
});
