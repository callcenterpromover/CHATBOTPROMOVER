// Roles del panel (RBAC). El rol se guarda en la tabla `operadores` (no en user_metadata, que el
// propio usuario puede modificar). La base aplica los mismos permisos con RLS.

export const ROLES = {
  super_admin: "Super administrador",
  administrador: "Administrador",
  operativo: "Operativo",
} as const;

export type Rol = keyof typeof ROLES;

export function esRol(v: unknown): v is Rol {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ROLES, v);
}

export function esAdmin(rol: Rol | null | undefined) {
  return rol === "super_admin" || rol === "administrador";
}

/** Pantalla principal según el rol (redirección después del login y botón de la página 404). */
export function inicioPorRol(rol: Rol | null | undefined) {
  if (!rol) return "/login";
  // Los administradores también gestionan solicitudes la mayor parte del tiempo (PRODUCT.md).
  return "/lista-espera";
}

/** Roles que un usuario puede asignar al gestionar usuarios. */
export function rolesGestionables(rol: Rol | null | undefined): Rol[] {
  if (rol === "super_admin") return ["super_admin", "administrador", "operativo"];
  if (rol === "administrador") return ["operativo"];
  return [];
}
