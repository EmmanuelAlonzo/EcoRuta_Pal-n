import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import MapView, { Marker, Callout, Polygon, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { THEME } from '../../constants/theme';

export default function EcoMap({
  centerCoordinate,
  initialRegion,
  truckLocation,
  markers = [],
  polygonCoordinates = [],
  onMapPress,
  onMarkerPress,
  height = 300,
  style,
}) {
  const mapRef = useRef(null);

  const defaultRegion = initialRegion || {
    latitude: centerCoordinate?.latitude || truckLocation?.latitude || 14.4042,
    longitude: centerCoordinate?.longitude || truckLocation?.longitude || -90.6978,
    latitudeDelta: 0.015,
    longitudeDelta: 0.015,
  };

  useEffect(() => {
    const lat = centerCoordinate?.latitude || truckLocation?.latitude;
    const lng = centerCoordinate?.longitude || truckLocation?.longitude;
    if (lat && lng && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      }, 800);
    }
  }, [centerCoordinate?.latitude, centerCoordinate?.longitude, truckLocation?.latitude, truckLocation?.longitude]);

  return (
    <View style={[styles.container, { height }, style]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={[StyleSheet.absoluteFillObject, styles.mapView]}
        initialRegion={defaultRegion}
        showsUserLocation={true}
        showsMyLocationButton={true}
        showsCompass={true}
        onPress={(e) => onMapPress && onMapPress(e.nativeEvent.coordinate)}
      >
        {/* Marcador de Ubicación del Camión Recolector */}
        {truckLocation?.latitude && truckLocation?.longitude && (
          <Marker
            coordinate={{
              latitude: truckLocation.latitude,
              longitude: truckLocation.longitude,
            }}
            title={truckLocation.title || 'Ubicación del Camión'}
            description={truckLocation.description || 'Unidad en operación'}
          >
            <View style={styles.truckMarkerBadge}>
              <Text style={styles.truckMarkerIcon}>🚛</Text>
            </View>
            <Callout>
              <View style={styles.calloutBox}>
                <Text style={styles.calloutTitle}>{truckLocation.title || '🚛 Camión Recolector'}</Text>
                <Text style={styles.calloutDesc}>{truckLocation.description || 'Unidad activa en ruta'}</Text>
              </View>
            </Callout>
          </Marker>
        )}

        {/* Marcadores de Viviendas o Puntos de Recolección */}
        {markers.map((m, idx) => {
          const isHouse = m.tipo === 'vivienda';
          return (
            <Marker
              key={m.id?.toString() || `marker_${idx}`}
              coordinate={{
                latitude: m.latitude,
                longitude: m.longitude,
              }}
              title={m.nombre_completo || m.title || `Punto #${idx + 1}`}
              description={m.direccion || m.description || 'Punto registrado'}
              onPress={() => onMarkerPress && onMarkerPress(m)}
            >
              <View
                style={[
                  styles.markerBadge,
                  isHouse ? styles.houseMarkerBadge : styles.collectionMarkerBadge,
                ]}
              >
                <Text style={styles.markerBadgeIcon}>
                  {isHouse ? '🏠' : (m.tipo_material?.includes('separad') ? '♻️' : '📦')}
                </Text>
              </View>
              <Callout>
                <View style={styles.calloutBox}>
                  <Text style={styles.calloutTitle}>{m.nombre_completo || m.title || 'Punto de Recolección'}</Text>
                  <Text style={styles.calloutDesc}>{m.direccion || m.description || 'Palín, Escuintla'}</Text>
                  {m.peso_kg ? (
                    <Text style={styles.calloutDetail}>⚖️ Peso: {m.peso_kg} kg</Text>
                  ) : null}
                </View>
              </Callout>
            </Marker>
          );
        })}

        {/* Polígono y Trazado de Calles de la Ruta */}
        {polygonCoordinates && polygonCoordinates.length > 1 && (
          <Polyline
            coordinates={polygonCoordinates}
            strokeColor="#2563EB"
            strokeWidth={3}
          />
        )}

        {polygonCoordinates && polygonCoordinates.length > 2 && (
          <Polygon
            coordinates={polygonCoordinates}
            fillColor="rgba(37, 99, 235, 0.22)"
            strokeColor="#1D4ED8"
            strokeWidth={2}
          />
        )}

        {/* Marcadores de Vértices del Trazado */}
        {polygonCoordinates &&
          polygonCoordinates.map((pt, idx) => (
            <Marker
              key={`poly_pt_${idx}`}
              coordinate={{ latitude: pt.latitude, longitude: pt.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.polygonVertexBadge}>
                <Text style={styles.polygonVertexText}>{idx + 1}</Text>
              </View>
            </Marker>
          ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  mapView: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  polygonVertexBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2563EB',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 4,
  },
  polygonVertexText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  container: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: '#E2E8F0',
  },
  truckMarkerBadge: {
    backgroundColor: '#1E40AF',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  truckMarkerIcon: {
    fontSize: 22,
  },
  markerBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  houseMarkerBadge: {
    backgroundColor: '#059669',
  },
  collectionMarkerBadge: {
    backgroundColor: '#D97706',
  },
  markerBadgeIcon: {
    fontSize: 18,
  },
  calloutBox: {
    padding: 8,
    maxWidth: 220,
  },
  calloutTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  calloutDesc: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  calloutDetail: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
    marginTop: 3,
  },
});
