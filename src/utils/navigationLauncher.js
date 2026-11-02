import { Linking, Alert, Platform } from 'react-native';

/**
 * Utilidad de Ruteo Dinámico y Navegación Externa (Waze y Google Maps)
 * Abre la aplicación de navegación seleccionada guiando al piloto en tiempo real por el tráfico.
 * 
 * @param {object} coords - { latitude, longitude, label }
 */
export const openExternalNavigation = async ({ latitude, longitude, label = 'Punto de Recolección' }) => {
  if (!latitude || !longitude) {
    Alert.alert('Coordenadas no disponibles', 'No se ha detectado una ubicación geográfica válida para la navegación.');
    return;
  }

  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  const encodedLabel = encodeURIComponent(label);

  const wazeAppUrl = `waze://?ll=${lat},${lng}&navigate=yes`;
  const wazeWebUrl = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;

  const googleMapsAppUrl = Platform.select({
    ios: `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`,
    android: `google.navigation:q=${lat},${lng}&mode=d`,
    default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
  });
  const googleMapsWebUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  Alert.alert(
    '🧭 Ruteo Dinámico para Piloto',
    `¿Con qué aplicación deseas navegar hacia "${label}"?`,
    [
      {
        text: '🚗 Waze (Tráfico en Vivo)',
        onPress: async () => {
          try {
            const canOpen = await Linking.canOpenURL(wazeAppUrl);
            if (canOpen) {
              await Linking.openURL(wazeAppUrl);
            } else {
              await Linking.openURL(wazeWebUrl);
            }
          } catch {
            await Linking.openURL(wazeWebUrl);
          }
        },
      },
      {
        text: '🗺️ Google Maps',
        onPress: async () => {
          try {
            const canOpen = await Linking.canOpenURL(googleMapsAppUrl);
            if (canOpen) {
              await Linking.openURL(googleMapsAppUrl);
            } else {
              await Linking.openURL(googleMapsWebUrl);
            }
          } catch {
            await Linking.openURL(googleMapsWebUrl);
          }
        },
      },
      {
        text: 'Cancelar',
        style: 'cancel',
      },
    ]
  );
};
