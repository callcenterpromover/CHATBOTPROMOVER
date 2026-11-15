import { createClient } from "@supabase/supabase-js";

// Cliente con la clave SECRETA: ignora RLS. Solo para código de servidor (webhook, bot, simulador,
// avisos del worker). Nunca importar desde un componente de cliente ni exponer la variable con
// prefijo NEXT_PUBLIC_.
export function crearClienteAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SECRET_KEY;
  if (!url || !clave) throw new Error("falta_configuracion_supabase_admin");
  return createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
}
