// Escribe en el «Registro de errores» del panel (tabla registro_errores, solo la ve el super_admin).
// Solo para código de servidor: usa la clave secreta. Nunca lanza: registrar un error no debe
// provocar otro. Los detalles se limpian de números largos (teléfonos, documentos).

import { crearClienteAdmin } from "@/lib/supabase/admin";

export type OrigenError = "webhook" | "envio" | "bot" | "ocr" | "worker" | "sistema";

/** Quita secuencias de 7 o más dígitos (teléfonos, documentos) y recorta. */
export function limpiarDetalle(detalle: string | null | undefined): string | null {
  if (!detalle) return null;
  const limpio = detalle.replace(/\+?\d[\d\s.-]{5,}\d/g, "[número]").trim().slice(0, 300);
  return limpio || null;
}

/** Muestra solo el final de un identificador técnico (p. ej. un phone_number_id) para poder compararlo. */
export function finalDe(id: string | null | undefined): string {
  return id ? `…${id.slice(-4)}` : "ninguno";
}

export async function registrarError(origen: OrigenError, codigo: string, detalle?: string | null) {
  console.warn("registro_error", origen, codigo);
  try {
    const { error } = await crearClienteAdmin().rpc("registrar_error", {
      p_origen: origen,
      p_codigo: codigo.slice(0, 80),
      p_detalle: limpiarDetalle(detalle),
    });
    if (error) console.error("registro_error_no_guardado", error.code ?? "");
  } catch (e) {
    console.error("registro_error_no_guardado", e instanceof Error ? e.message : "desconocido");
  }
}
