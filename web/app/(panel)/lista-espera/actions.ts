"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirSesion } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Las tres acciones usan funciones de la base que verifican el rol y evitan que dos personas
// tomen la misma solicitud. Aquí solo se valida la entrada y se redirige.
async function contexto(id: string) {
  if (!UUID.test(id)) redirect("/lista-espera");
  const sesion = await requerirSesion();
  if (!sesion.operador) redirect("/login");
  return sesion;
}

function refrescar(id: string) {
  revalidatePath("/lista-espera");
  revalidatePath(`/solicitudes/${id}`);
  revalidatePath("/dashboard");
}

/** «Sí, gestionar»: la solicitud pasa a «Mi cola de trabajo» y se abre su ficha. */
export async function tomarSolicitud(id: string) {
  const { supabase } = await contexto(id);
  const { data, error } = await supabase.rpc("tomar_solicitud", { p_id: id });
  refrescar(id);
  if (error || data !== true) redirect("/lista-espera?tab=bolsa&aviso=tomada");
  redirect(`/solicitudes/${id}?ok=tomada`);
}

/** Devolver a la bolsa general (quien la tiene asignada, o un administrador). */
export async function devolverSolicitud(id: string, volverA: string) {
  const { supabase } = await contexto(id);
  const { data, error } = await supabase.rpc("devolver_solicitud", { p_id: id });
  refrescar(id);
  const ok = !error && data === true;
  if (volverA === "ficha") redirect(`/solicitudes/${id}?${ok ? "ok=devuelta" : "error=cola"}`);
  const destino = volverA.startsWith("/lista-espera") ? volverA : "/lista-espera?tab=mia";
  redirect(`${destino}&aviso=${ok ? "devuelta" : "error"}`);
}

/** Asignar o reasignar a un operador (solo administradores; la base lo verifica). */
export async function asignarSolicitud(id: string, volverA: string, formData: FormData) {
  const { supabase } = await contexto(id);
  const usuario = String(formData.get("usuario") ?? "");
  if (!UUID.test(usuario)) redirect(`${volverA}${volverA.includes("?") ? "&" : "?"}aviso=error`);
  const { data, error } = await supabase.rpc("asignar_solicitud", { p_id: id, p_usuario: usuario });
  refrescar(id);
  const ok = !error && data === true;
  const destino = volverA.startsWith("/solicitudes/") || volverA.startsWith("/lista-espera") ? volverA : "/lista-espera";
  redirect(`${destino}${destino.includes("?") ? "&" : "?"}aviso=${ok ? "asignada" : "error"}`);
}
