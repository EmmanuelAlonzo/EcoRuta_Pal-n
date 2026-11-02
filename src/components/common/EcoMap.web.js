import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { THEME } from '../../constants/theme';

export default function EcoMapWeb({
  initialRegion,
  truckLocation,
  markers = [],
  height = 300,
  style,
}) {
  const centerLat = truckLocation?.latitude || initialRegion?.latitude || 14.4042;
  const centerLng = truckLocation?.longitude || initialRegion?.longitude || -90.6978;

  const htmlContent = useMemo(() => {
    const markersJson = JSON.stringify(markers);
    const truckJson = JSON.stringify(truckLocation || null);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          body, html { margin: 0; padding: 0; height: 100%; width: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          #map { height: 100%; width: 100%; }
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
          const map = L.map('map', { zoomControl: true }).setView([${centerLat}, ${centerLng}], 15);
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap | EcoRuta Palín'
          }).addTo(map);

          const truck = ${truckJson};
          const markers = ${markersJson};

          if (truck && truck.latitude && truck.longitude) {
            const truckIcon = L.divIcon({
              className: 'custom-div-icon truck-icon',
              html: '🚛',
              iconSize: [38, 38],
              iconAnchor: [19, 19],
              popupAnchor: [0, -19]
            });
            L.marker([truck.latitude, truck.longitude], { icon: truckIcon })
              .addTo(map)
              .bindPopup('<div class="popup-title">🚛 ' + (truck.title || 'Camión Recolector') + '</div><div class="popup-desc">' + (truck.description || 'Unidad activa en ruta') + '</div>');
          }

          markers.forEach(m => {
            if (m.latitude && m.longitude) {
              const isHouse = m.tipo === 'vivienda';
              const iconClass = isHouse ? 'house-icon' : 'collection-icon';
              const emoji = isHouse ? '🏠' : (m.tipo_material && m.tipo_material.includes('separad') ? '♻️' : '📦');

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
                popupHtml += '<div class="popup-desc" style="color:#059669;font-weight:700;margin-top:4px;">⚖️ Peso: ' + m.peso_kg + ' kg (' + (m.tipo_material || 'reciclaje') + ')</div>';
              }

              L.marker([m.latitude, m.longitude], { icon: markerIcon })
                .addTo(map)
                .bindPopup(popupHtml);
            }
          });
        </script>
      </body>
      </html>
    `;
  }, [centerLat, centerLng, truckLocation, markers]);

  return (
    <View style={[styles.container, { height }, style]}>
      <iframe
        title="EcoRuta Map View"
        srcDoc={htmlContent}
        style={{
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
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: '#E2E8F0',
  },
});
