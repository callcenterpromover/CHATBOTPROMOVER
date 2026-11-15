"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AUTORIZACION_ESTADO,
  CATEGORIAS,
  EPS,
  ESTADOS,
  HISTORIA_ESTADO,
  MOTIVOS_CIERRE,
  ORDEN_ESTADO,
  PLAN_ESTADO,
  esValor,
} from "@/lib/catalogo";
import { requerirSesion } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cada acción vuelve a comprobar sesión y operador; la base lo exige además con RLS.
async function contexto(id: string) {
  if (!UUID.test(id)) redirect("/lista-espera");
  const { supabase, operador } = await requerirSesion();
  if (!operador) redirect("/login");
  return supabase;
}

function volver(id: string, parametro: string): never {
  revalidatePath(`/solicitudes/${id}`);
  redirect(`/solicitudes/${id}?${parametro}`);
}

export async function guardarGestion(id: string, formData: FormData) {
  const supabase = await contexto(id);
  const cambios: Record<string, string | null> = {};

  const selectores = [
    ["estado", ESTADOS],
    ["categoria_probable", CATEGORIAS],
    ["eps", EPS],
    ["orden_estado", ORDEN_ESTADO],
    ["historia_estado", HISTORIA_ESTADO],
    ["plan_estado", PLAN_ESTADO],
    ["autorizacion_estado", AUTORIZACION_ESTADO],
  ] as const;
  for (const [campo, mapa] of selectores) {
    const v = formData.get(campo);
    if (v === null) continue;
    if (!esValor(mapa, v)) volver(id, "error=dato");
    cambios[campo] = v;
  }

  const revision = formData.get("revision_humana");
  if (revision !== null) {
    if (revision !== "PENDIENTE" && revision !== "COMPLETADA") volver(id, "error=dato");
    cambios.revision_humana = revision;
  }

  const nombre = formData.get("nombre");
  if (nombre !== null) cambios.nombre = String(nombre).trim().slice(0, 120) || null;

  const documento = formData.get("documento");
  if (documento !== null) {
    const d = String(documento).trim();
    if (d && !/^[0-9A-Za-z]{4,20}$/.test(d)) volver(id, "error=documento");
    cambios.documento = d || null;
  }

  const cita = formData.get("cita_previa_fecha");
  if (cita !== null) {
    const c = String(cita);
    if (c && !/^\d{4}-\d{2}-\d{2}$/.test(c)) volver(id, "error=dato");
    cambios.cita_previa_fecha = c || null;
  }

  // RLS no devuelve error cuando la fila no es editable (solo 0 filas): se comprueba explícitamente.
  const { data: filas, error } = await supabase.from("solicitudes").update(cambios).eq("id", id).select("id");
  if (error) volver(id, "error=guardar");
  if (!filas?.length) volver(id, "error=permiso");
  revalidatePath("/lista-espera");
  volver(id, "ok=guardado");
}

export async function corregirCampo(id: string, campoId: number, formData: FormData) {
  const supabase = await contexto(id);
  const valor = String(formData.get("valor_corregido") ?? "").trim().slice(0, 200);
  if (!valor) volver(id, "error=dato");
  const { data: filas, error } = await supabase
    .from("campos_extraidos")
    .update({ valor_corregido: valor, verificacion: "CORREGIDO_HUMANO" })
    .eq("id", campoId)
    .eq("solicitud_id", id)
    .select("id");
  if (error) volver(id, "error=guardar");
  if (!filas?.length) volver(id, "error=permiso");
  revalidatePath("/lista-espera");
  volver(id, "ok=corregido");
}

export async function marcarAlerta(id: string, alertaId: number, resuelta: boolean) {
  const supabase = await contexto(id);
  const { data: filas, error } = await supabase
    .from("alertas")
    .update({ resuelta })
    .eq("id", alertaId)
    .eq("solicitud_id", id)
    .select("id");
  if (error) volver(id, "error=guardar");
  if (!filas?.length) volver(id, "error=permiso");
  revalidatePath("/lista-espera");
  volver(id, "ok=alerta");
}

export async function agregarObservacion(id: string, formData: FormData) {
  const supabase = await contexto(id);
  const texto = String(formData.get("texto") ?? "").trim();
  if (texto.length < 1 || texto.length > 500) volver(id, "error=observacion");
  const { error } = await supabase.from("observaciones").insert({ solicitud_id: id, texto });
  if (error) volver(id, "error=guardar");
  volver(id, "ok=observacion");
}

export async function borrarObservacion(id: string, observacionId: number) {
  const supabase = await contexto(id);
  const { data: filas, error } = await supabase
    .from("observaciones")
    .delete()
    .eq("id", observacionId)
    .eq("solicitud_id", id)
    .select("id");
  if (error) volver(id, "error=guardar");
  if (!filas?.length) volver(id, "error=permiso");
  volver(id, "ok=observacion");
}

/**
 * Cierre humano explícito. La función de base borra la solicitud y todo lo
 * asociado en una sola transacción y verifica que no quede nada; si algo
 * falla, no se borra nada y aquí NO se confirma el cierre.
 */
export async function cerrarSolicitud(id: string, formData: FormData) {
  const supabase = await contexto(id);
  const motivo = String(formData.get("motivo") ?? "");
  if (!(MOTIVOS_CIERRE as readonly string[]).includes(motivo)) volver(id, "error=dato");

  const { data, error } = await supabase.rpc("cerrar_solicitud", { p_id: id, p_motivo: motivo });
  if (error || !data?.eliminada) {
    console.error("cierre_fallido", error?.code ?? "sin_codigo"); // sin datos del paciente
    volver(id, "error=cierre");
  }

  // Segunda comprobación desde la aplicación.
  const { count } = await supabase.from("solicitudes").select("id", { count: "exact", head: true }).eq("id", id);
  if (count !== 0) volver(id, "error=cierre");

  revalidatePath("/lista-espera");
  revalidatePath("/dashboard");
  redirect("/lista-espera?cerrada=1");
}
