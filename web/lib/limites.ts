// Límite de intentos guardado en la base (Vercel no comparte memoria entre instancias).
// Las claves se resumen con HMAC: en la base nunca queda la IP, el correo ni el teléfono en claro.
// Solo para código de servidor: usa la clave secreta.

import { createHmac } from "node:crypto";
import { crearClienteAdmin } from "@/lib/supabase/admin";

export function claveLimite(tipo: string, valor: string): string {
  const secreto = process.env.SUPABASE_SECRET_KEY ?? "";
  const resumen = createHmac("sha256", `limites:${secreto}`).update(valor.trim().toLowerCase()).digest("hex");
  return `${tipo}:${resumen.slice(0, 40)}`;
}

/**
 * Registra un uso y devuelve false si ya se superó el límite. Si la base no responde se deja pasar
 * (Supabase Auth y la firma del webhook siguen protegiendo); el fallo queda en el registro.
 */
export async function dentroDelLimite(clave: string, maximo: number, ventanaSeg: number): Promise<boolean> {
  try {
    const { data, error } = await crearClienteAdmin().rpc("consumir_limite", {
      p_clave: clave,
      p_max: maximo,
      p_ventana_seg: ventanaSeg,
    });
    if (error) throw new Error(error.code ?? "rpc");
    return data !== false;
  } catch (e) {
    console.error("limite_no_disponible", e instanceof Error ? e.message : "desconocido");
    return true;
  }
}

export async function reiniciarLimite(clave: string): Promise<void> {
  try {
    await crearClienteAdmin().rpc("reiniciar_limite", { p_clave: clave });
  } catch {
    // No es crítico: los registros vencen solos.
  }
}

/** IP del cliente según el proxy de Vercel (primer valor de x-forwarded-for). */
export function ipCliente(cabeceras: Headers): string {
  return (cabeceras.get("x-forwarded-for")?.split(",")[0] ?? cabeceras.get("x-real-ip") ?? "desconocida").trim();
}
