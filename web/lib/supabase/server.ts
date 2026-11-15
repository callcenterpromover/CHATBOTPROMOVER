import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { esRol, inicioPorRol, type Rol } from "@/lib/roles";
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

export type Operador = { nombre: string; rol: Rol };

/** Usuario y operador actuales, sin redirigir (una sola consulta por petición). */
export const obtenerSesion = cache(async () => {
  const supabase = await crearCliente();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, operador: null };

  const { data } = await supabase
    .from("operadores")
    .select("nombre, activo, rol")
    .eq("user_id", user.id)
    .maybeSingle();
  const operador: Operador | null = data?.activo && esRol(data.rol) ? { nombre: data.nombre, rol: data.rol } : null;
  return { supabase, user, operador };
});

/**
 * Exige sesión válida (verificada contra el servidor de Auth) y devuelve el operador con su rol
 * (null si la cuenta no está habilitada). Usar en cada página y cada acción.
 */
export async function requerirSesion() {
  const sesion = await obtenerSesion();
  if (!sesion.user) redirect("/login");
  return { supabase: sesion.supabase, user: sesion.user, operador: sesion.operador };
}

/** Exige uno de los roles indicados; si no, lleva al usuario a su pantalla principal. */
export async function requerirRol(roles: Rol[]) {
  const sesion = await requerirSesion();
  if (!sesion.operador) redirect("/login");
  if (!roles.includes(sesion.operador.rol)) redirect(inicioPorRol(sesion.operador.rol));
  return { ...sesion, operador: sesion.operador };
}
