/**
 * Roles del sistema Econoruta Palín
 * Coincide con la restricción de la tabla `perfiles` en Supabase.
 */
export const ROLES = {
  CLIENTE: 'cliente',
  OPERARIO: 'operario',
  ADMIN: 'admin',
};

export const ROLE_LABELS = {
  [ROLES.CLIENTE]: 'Ciudadano / Cliente',
  [ROLES.OPERARIO]: 'Operario de Recolección',
  [ROLES.ADMIN]: 'Administrador Municipal',
};
