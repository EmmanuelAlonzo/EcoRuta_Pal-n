/**
 * Roles del sistema Econoruta Palín
 * Coincide con la restricción de la tabla `perfiles` en Supabase.
 */
export const ROLES = {
  CLIENTE: 'cliente',
  OPERARIO: 'operario',
  PILOTO: 'piloto',
  SUPERVISOR: 'supervisor',
  ADMIN: 'admin',
};

export const ROLE_LABELS = {
  [ROLES.CLIENTE]: 'Ciudadano / Cliente',
  [ROLES.OPERARIO]: 'Operario de Recolección',
  [ROLES.PILOTO]: 'Piloto de Unidad',
  [ROLES.SUPERVISOR]: 'Supervisor de Logística',
  [ROLES.ADMIN]: 'Administrador Municipal',
};
