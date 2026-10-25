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
import { THEME } from '../../constants/theme';
import { getPendingRedemptions, approveRedemption, rejectRedemption } from '../../api/admin';

export default function ManageRedemptionsScreen({ navigation }) {
  const [redemptions, setRedemptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  const loadRedemptions = useCallback(async (isPullToRefresh = false) => {
    if (isPullToRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const data = await getPendingRedemptions();
      setRedemptions(data || []);
    } catch (err) {
      console.error('[ManageRedemptions] Error al cargar canjes desde Supabase:', err);
      Alert.alert('Error', 'No se pudieron consultar los canjes pendientes de Supabase.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadRedemptions();
    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadRedemptions();
    });
    return unsubscribe;
  }, [navigation, loadRedemptions]);

  /**
   * Marcar canje como entregado en Supabase
   */
  const handleApprove = (item) => {
    Alert.alert(
      '📦 Confirmar Entrega',
      `¿Confirmas que el incentivo "${item.incentivo_nombre}" fue entregado físicamente al ciudadano ${item.cliente_nombre}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, Marcar Entregado',
          style: 'default',
          onPress: async () => {
            setProcessingId(item.id);
            try {
              await approveRedemption(item.id);
              await loadRedemptions();

              Alert.alert(
                '✅ Canje Entregado',
                `El canje de "${item.incentivo_nombre}" para ${item.cliente_nombre} ha sido marcado como entregado.`
              );
            } catch (err) {
              console.error('[ManageRedemptions] Error al aprobar canje:', err);
              Alert.alert(
                'Error al actualizar',
                err.message || 'No se pudo actualizar el estado del canje en Supabase.'
              );
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]
    );
  };

  /**
   * Rechazar canje y reembolsar puntos en Supabase
   */
  const handleReject = (item) => {
    Alert.alert(
      '⚠️ Rechazar Canje',
      `¿Estás seguro de rechazar la solicitud de "${item.incentivo_nombre}" para ${item.cliente_nombre}?\n\nSe devolverán ${item.puntos_descontados} puntos a su cuenta y se restaurará el stock del incentivo.`,
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: 'Rechazar y Reembolsar',
          style: 'destructive',
          onPress: async () => {
            setProcessingId(item.id);
            try {
              await rejectRedemption(item.id);
              await loadRedemptions();

              Alert.alert(
                'Canje Rechazado',
                `Se canceló la solicitud y los ${item.puntos_descontados} puntos fueron devueltos a ${item.cliente_nombre}.`
              );
            } catch (err) {
              console.error('[ManageRedemptions] Error al rechazar canje:', err);
              Alert.alert(
                'Error al rechazar',
                err.message || 'No se pudo rechazar el canje en Supabase.'
              );
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]
    );
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

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>Auditoría de Canjes</Text>
      <Text style={styles.headerSubtitle}>
        Verifica y valida las entregas de incentivos reclamados por vecinos de Palín.
      </Text>

      <View style={styles.queueBadgeRow}>
        <View style={styles.queueBadge}>
          <Text style={styles.queueBadgeDot}>⏳</Text>
          <Text style={styles.queueBadgeText}>
            {redemptions.length} canje(s) pendiente(s) de entrega
          </Text>
        </View>
      </View>
    </View>
  );

  const renderItem = ({ item }) => {
    const isThisProcessing = processingId === item.id;

    return (
      <View style={styles.card}>
        <View style={styles.cardTopRow}>
          <View style={styles.rewardIconBadge}>
            <Text style={styles.rewardIcon}>🎁</Text>
          </View>
          <View style={styles.cardHeaderInfo}>
            <Text style={styles.incentiveTitle}>{item.incentivo_nombre}</Text>
            <Text style={styles.merchantText}>📍 {item.incentivo_comercio || 'Comercio de Palín'}</Text>
          </View>
          <View style={styles.pointsBadge}>
            <Text style={styles.pointsBadgeText}>⭐ {item.puntos_descontados} pts</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Datos del Ciudadano */}
        <View style={styles.citizenRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.citizenLabel}>BENEFICIARIO:</Text>
            <Text style={styles.citizenName}>{item.cliente_nombre}</Text>
            {item.cliente_email ? (
              <Text style={styles.citizenEmail}>{item.cliente_email}</Text>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.dateLabel}>SOLICITADO:</Text>
            <Text style={styles.dateValue}>{formatDate(item.fecha_canje)}</Text>
          </View>
        </View>

        {/* Botones de Acción: Aprobar o Rechazar */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            style={[styles.rejectButton, isThisProcessing && styles.buttonDisabled]}
            onPress={() => handleReject(item)}
            disabled={isThisProcessing}
            activeOpacity={0.8}
          >
            <Text style={styles.rejectButtonText}>✕ Rechazar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.approveButton, isThisProcessing && styles.buttonDisabled]}
            onPress={() => handleApprove(item)}
            disabled={isThisProcessing}
            activeOpacity={0.8}
          >
            {isThisProcessing ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.approveButtonText}> Procesando...</Text>
              </View>
            ) : (
              <Text style={styles.approveButtonText}>✓ Entregar</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={THEME.roles.admin} />
          <Text style={styles.loadingText}>Cargando solicitudes de canje...</Text>
        </View>
      ) : (
        <FlatList
          data={redemptions}
          keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
          ListHeaderComponent={renderHeader}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadRedemptions(true)}
              colors={[THEME.roles.admin]}
              tintColor={THEME.roles.admin}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🎉</Text>
              <Text style={styles.emptyTitle}>¡Todo al día!</Text>
              <Text style={styles.emptyDesc}>
                No hay canjes pendientes de entrega en este momento. Todas las recompensas han sido procesadas satisfactoriamente en Supabase.
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
  header: {
    paddingTop: 16,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  queueBadgeRow: {
    flexDirection: 'row',
    marginTop: 12,
  },
  queueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  queueBadgeDot: {
    fontSize: 13,
    marginRight: 6,
  },
  queueBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
  },
  card: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 18,
    padding: 16,
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
    alignItems: 'center',
  },
  rewardIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rewardIcon: {
    fontSize: 22,
  },
  cardHeaderInfo: {
    flex: 1,
  },
  incentiveTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  merchantText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  pointsBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  pointsBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4338CA',
  },
  divider: {
    height: 1,
    backgroundColor: THEME.colors.border,
    marginVertical: 12,
  },
  citizenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  citizenLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
    letterSpacing: 0.5,
  },
  citizenName: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  citizenEmail: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 1,
  },
  dateLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
    letterSpacing: 0.5,
  },
  dateValue: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  rejectButton: {
    flex: 1,
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButtonText: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 13,
  },
  approveButton: {
    flex: 2,
    backgroundColor: THEME.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: THEME.colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  approveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
