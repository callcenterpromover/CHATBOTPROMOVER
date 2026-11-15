import { redirect } from "next/navigation";
import { inicioPorRol } from "@/lib/roles";
import { requerirSesion } from "@/lib/supabase/server";

// La raíz solo redirige a la pantalla principal de cada rol.
export default async function Inicio() {
  const { operador } = await requerirSesion();
  if (!operador) return null; // el layout muestra el aviso de cuenta no habilitada
  redirect(inicioPorRol(operador.rol));
}
