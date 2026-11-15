import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { opcionesSeguras } from "./sesion";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/** Cliente de Supabase con la sesión del usuario (clave pública + RLS). */
export async function crearCliente() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(lista) {
        try {
          lista.forEach(({ name, value, options }) => cookieStore.set(name, value, opcionesSeguras(options)));
        } catch {
          // Desde un Server Component no se pueden escribir cookies; el proxy refresca la sesión.
        }
      },
    },
  });
}

/**
 * Exige sesión válida (verificada contra el servidor de Auth) y devuelve si el
 * usuario está en la lista de operadores. Usar en cada página y cada acción.
 */
export async function requerirSesion() {
  const supabase = await crearCliente();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: operador } = await supabase
    .from("operadores")
    .select("nombre, activo")
    .eq("user_id", user.id)
    .maybeSingle();

  return { supabase, user, operador: operador?.activo ? operador : null };
}
