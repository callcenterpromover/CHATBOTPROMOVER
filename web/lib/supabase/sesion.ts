// Opciones comunes de las cookies de sesión y control de inactividad.

export const COOKIE_ACTIVIDAD = "pv_actividad";
export const MINUTOS_INACTIVIDAD = 30;

/**
 * Las cookies de sesión nunca son legibles desde JavaScript del navegador (httpOnly): el panel
 * solo usa Supabase desde el servidor, así que un script inyectado no puede robar la sesión.
 */
export function opcionesSeguras<T extends object>(opciones: T | undefined) {
  return {
    ...opciones,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

export const opcionesActividad = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24,
};

export function sesionInactiva(valor: string | undefined, ahora = Date.now()) {
  const ultima = Number(valor);
  // Sin marca de actividad también cuenta como inactiva (por ejemplo, cookie borrada).
  return !Number.isFinite(ultima) || ultima <= 0 || ahora - ultima > MINUTOS_INACTIVIDAD * 60_000;
}
