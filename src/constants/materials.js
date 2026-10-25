/**
 * Tipos de materiales reciclables reconocidos en Econoruta Palín.
 * Incluye factores de cálculo de puntos para el programa de incentivos.
 */
export const RECYCLING_MATERIALS = [
  { id: 'plastico', name: 'Plástico (PET/HDPE)', icon: '🧴', puntosPorKg: 15 },
  { id: 'carton', name: 'Cartón y Papel', icon: '📦', puntosPorKg: 10 },
  { id: 'aluminio', name: 'Aluminio y Latas', icon: '🥫', puntosPorKg: 25 },
  { id: 'vidrio', name: 'Vidrio', icon: '🍾', puntosPorKg: 8 },
  { id: 'mixto', name: 'Residuos Mixtos', icon: '♻️', puntosPorKg: 5 },
];
