import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/useAuthStore';
import { THEME } from '../../constants/theme';
import { getGlobalMetrics } from '../../api/admin';

export default function AdminHomeScreen({ navigation }) {
  const profile = useAuthStore((state) => state.profile);
  const logout = useAuthStore((state) => state.logout);

  const [metrics, setMetrics] = useState({
    totalKg: 0,
    totalPuntos: 0,
    totalRecolecciones: 0,
    pendingCanjes: 0,
    totalClientes: 0,
    materialStats: { plastico: 0, carton: 0, aluminio: 0, vidrio: 0, mixto: 0 },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadMetrics = useCallback(async (isPullToRefresh = false) => {
    if (isPullToRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const data = await getGlobalMetrics();
      setMetrics(data);
    } catch (err) {
      console.warn('[AdminHome] Error al cargar métricas:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadMetrics();
    });
    return unsubscribe;
  }, [navigation, loadMetrics]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadMetrics(true)}
            colors={[THEME.roles.admin]}
            tintColor={THEME.roles.admin}
          />
        }
      >
        {/* Banner Superior con Rol y Logout */}
        <View style={styles.badgeRow}>
          <View style={[styles.roleTag, { backgroundColor: THEME.roles.admin }]}>
            <Text style={styles.roleTagText}>⚙️ Rol: Administrador Municipal</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutBtnText}>Cerrar Sesión</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.welcomeText}>Panel Gerencial: {profile?.nombre_completo || 'Administrador'}</Text>
        <Text style={styles.deptText}>
          {profile?.departamento || 'Gestión Ambiental y Servicios Públicos • Palín'}
        </Text>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={THEME.roles.admin} />
            <Text style={styles.loadingText}>Calculando métricas del municipio...</Text>
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
                Total de residuos reciclables recolectados y desviados del vertedero municipal.
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

            {/* 4. Rutas y Monitoreo Municipal */}
            <View style={styles.routesCard}>
              <Text style={styles.routesTitle}>🚛 Rutas de Recolección en Operación</Text>
              <View style={styles.routeItem}>
                <Text style={styles.routeBullet}>🟢</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.routeName}>Ruta Verde Norte (Zona 1 Palín)</Text>
                  <Text style={styles.routeSub}>Barrio San José y San Pedro • Unidad CAM-01</Text>
                </View>
                <Text style={styles.routeStatus}>Activa</Text>
              </View>

              <View style={[styles.routeItem, { marginTop: 8 }]}>
                <Text style={styles.routeBullet}>🟢</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.routeName}>Ruta Verde Sur (Zona 2 El Calvario)</Text>
                  <Text style={styles.routeSub}>Sector El Mirador y Periférico • Unidad CAM-02</Text>
                </View>
                <Text style={styles.routeStatus}>Activa</Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
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
});
