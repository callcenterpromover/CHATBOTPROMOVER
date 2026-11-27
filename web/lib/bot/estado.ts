import type { SupabaseClient } from "@supabase/supabase-js";

/** ¿Está encendido el bot de WhatsApp? Ante cualquier duda (sin fila o error) se considera pausado. */
export async function botActivo(db: SupabaseClient): Promise<boolean> {
  const { data, error } = await db.from("configuracion_bot").select("activo").eq("id", 1).maybeSingle();
  return !error && data?.activo === true;
}

/** ¿Está encendido el modo simulación (Configuraciones)? Ante cualquier duda se considera apagado. */
export async function modoSimulacion(db: SupabaseClient): Promise<boolean> {
  const { data, error } = await db.from("configuracion_bot").select("simulacion").eq("id", 1).maybeSingle();
  return !error && data?.simulacion === true;
}
