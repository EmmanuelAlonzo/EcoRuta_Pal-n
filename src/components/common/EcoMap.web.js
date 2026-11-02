import React, { useMemo, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { THEME } from '../../constants/theme';

export default function EcoMapWeb({
  centerCoordinate,
  initialRegion,
  truckLocation,
  markers = [],
  polygonCoordinates = [],
  onMapPress,
  height = 300,
  zoomLevel = 15,
  style,
}) {
  // Inyección dinámica de Leaflet CSS en el <head> del DOM principal en Web
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const linkId = 'leaflet-css-cdn';
      if (!document.getElementById(linkId)) {
        const link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.crossOrigin = '';
        document.head.appendChild(link);
      }
    }
  }, []);

  // Escuchar clics en el mapa transmitidos desde el iframe
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === 'ECO_MAP_CLICK' && typeof onMapPress === 'function') {
        onMapPress({
          latitude: event.data.latitude,
          longitude: event.data.longitude,
        });
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }
  }, [onMapPress]);

  const centerLat = centerCoordinate?.latitude || truckLocation?.latitude || initialRegion?.latitude || 14.4042;
  const centerLng = centerCoordinate?.longitude || truckLocation?.longitude || initialRegion?.longitude || -90.6978;

  const htmlContent = useMemo(() => {
    const markersJson = JSON.stringify(markers);
    const polygonJson = JSON.stringify(polygonCoordinates || []);
    const truckJson = JSON.stringify(
      truckLocation || (centerCoordinate?.id === 'truck' ? centerCoordinate : null)
    );

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
        <style>
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: #E2E8F0;
          }
          /* Contenedor div principal con width y height absolutos al 100% */
          #map {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            width: 100%;
            height: 100%;
          }
          .custom-div-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            border: 2px solid #FFFFFF;
            box-shadow: 0 3px 6px rgba(0,0,0,0.3);
            font-size: 16px;
          }
          .truck-icon {
            background-color: #1E40AF;
            width: 38px !important;
            height: 38px !important;
            border: 3px solid #FFFFFF;
            font-size: 20px;
          }
          .house-icon {
            background-color: #059669;
            width: 32px !important;
            height: 32px !important;
          }
          .collection-icon {
            background-color: #D97706;
            width: 32px !important;
            height: 32px !important;
          }
          .vertex-icon {
            background-color: #2563EB;
            width: 22px !important;
            height: 22px !important;
            border: 2px solid #FFFFFF;
            box-shadow: 0 2px 4px rgba(0,0,0,0.4);
          }
          .leaflet-popup-content-wrapper {
            border-radius: 12px;
            padding: 4px;
            font-size: 13px;
          }
          .popup-title {
            font-weight: 800;
            color: #0F172A;
            margin-bottom: 2px;
          }
          .popup-desc {
            color: #64748B;
            font-size: 11px;
            line-height: 14px;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          // Inicializar mapa centrado en coordenadas
          const map = L.map('map', { 
            zoomControl: true,
            attributionControl: true
          }).setView([${centerLat}, ${centerLng}], ${zoomLevel});
          
          L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | EcoRuta Palín'
          }).addTo(map);

          // Escuchar clics en el mapa para delimitar polígono
          map.on('click', function(e) {
            window.parent.postMessage({
              type: 'ECO_MAP_CLICK',
              latitude: e.latlng.lat,
              longitude: e.latlng.lng
            }, '*');
          });

          // Forzar invalidación de tamaño para renderizado inmediato sin cuadros grises
          setTimeout(function() {
            if (map) {
              map.invalidateSize();
            }
          }, 150);

          window.addEventListener('resize', function() {
            if (map) {
              map.invalidateSize();
            }
          });

          const truck = ${truckJson};
          const markers = ${markersJson};
          const polyCoords = ${polygonJson};

          // Trazado de polígono / calles
          if (polyCoords && polyCoords.length > 0) {
            const latLngs = polyCoords.map(function(pt) {
              return [pt.latitude || pt.lat, pt.longitude || pt.lng];
            });

            if (polyCoords.length > 2) {
              L.polygon(latLngs, {
                color: '#1D4ED8',
                fillColor: '#3B82F6',
                fillOpacity: 0.25,
                weight: 3
              }).addTo(map);
            } else if (polyCoords.length > 1) {
              L.polyline(latLngs, {
                color: '#2563EB',
                weight: 3
              }).addTo(map);
            }

            polyCoords.forEach(function(pt, idx) {
              const pLat = pt.latitude || pt.lat;
              const pLng = pt.longitude || pt.lng;
              const vIcon = L.divIcon({
                className: 'custom-div-icon vertex-icon',
                html: '<span style="color:#FFF;font-size:10px;font-weight:800;">' + (idx + 1) + '</span>',
                iconSize: [22, 22],
                iconAnchor: [11, 11]
              });
              L.marker([pLat, pLng], { icon: vIcon }).addTo(map);
            });
          }

          if (truck && (truck.latitude || truck.latitud) && (truck.longitude || truck.longitud)) {
            const tLat = truck.latitude || truck.latitud;
            const tLng = truck.longitude || truck.longitud;
            const truckIcon = L.divIcon({
              className: 'custom-div-icon truck-icon',
              html: '🚛',
              iconSize: [38, 38],
              iconAnchor: [19, 19],
              popupAnchor: [0, -19]
            });
            L.marker([tLat, tLng], { icon: truckIcon })
              .addTo(map)
              .bindPopup('<div class="popup-title">🚛 ' + (truck.title || 'Camión Recolector') + '</div><div class="popup-desc">' + (truck.description || 'Unidad activa en ruta') + '</div>');
          }

          markers.forEach(m => {
            const mLat = m.latitude || m.latitud;
            const mLng = m.longitude || m.longitud;

            if (mLat && mLng) {
              const isHouse = m.tipo === 'vivienda';
              const isTruck = m.tipo === 'camion';
              const iconClass = isTruck ? 'truck-icon' : isHouse ? 'house-icon' : 'collection-icon';
              const emoji = isTruck ? '🚛' : isHouse ? '🏠' : (m.tipo_material && m.tipo_material.includes('separad') ? '♻️' : '📦');

              const markerIcon = L.divIcon({
                className: 'custom-div-icon ' + iconClass,
                html: emoji,
                iconSize: [32, 32],
                iconAnchor: [16, 16],
                popupAnchor: [0, -16]
              });

              let popupHtml = '<div class="popup-title">' + (m.nombre_completo || m.title || 'Punto de Recolección') + '</div>';
              popupHtml += '<div class="popup-desc">📍 ' + (m.direccion || m.description || 'Palín, Escuintla') + '</div>';
              if (m.peso_kg) {
                popupHtml += '<div class="popup-desc" style="color:#059669;font-weight:700;margin-top:4px;">⚖️ Peso: ' + m.peso_kg + ' kg (' + (m.tipo_material || m.material_tipo || 'reciclaje') + ')</div>';
              }

              L.marker([mLat, mLng], { icon: markerIcon })
                .addTo(map)
                .bindPopup(popupHtml);
            }
          });
        </script>
      </body>
      </html>
    `;
  }, [centerLat, centerLng, truckLocation, centerCoordinate, markers, polygonCoordinates, zoomLevel]);

  return (
    <View style={[styles.container, { height }, style]}>
      <iframe
        title="EcoRuta Map View"
        srcDoc={htmlContent}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          border: 'none',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: '#E2E8F0',
  },
});
