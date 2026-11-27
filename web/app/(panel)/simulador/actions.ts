"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { modoSimulacion } from "@/lib/bot/estado";
import type { Entrada } from "@/lib/bot/motor";
import { manejarEntrada } from "@/lib/bot/servicio";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { requerirSesion } from "@/lib/supabase/server";
import { DOCUMENTOS_FICTICIOS } from "./documentos";

// Solo números ficticios (5730000000xx): el simulador nunca puede tocar la conversación de un
// paciente real que escriba por WhatsApp.
const TELEFONO = /^5730000000\d{2}$/;

async function preparar(telefono: string) {
  if (!(await modoSimulacion(crearClienteAdmin()))) redirect("/");
  const { operador } = await requerirSesion();
  if (!operador || !TELEFONO.test(telefono)) redirect("/");
}

async function simular(telefono: string, registro: string, entrada: Entrada) {
  await preparar(telefono);
  const db = crearClienteAdmin();
  await db.from("mensajes_simulador").insert({ telefono, direccion: "ENTRANTE", texto: registro });
  let error = "";
  try {
    await manejarEntrada(telefono, entrada, "simulador");
  } catch (e) {
    console.error("simulador_fallo", e instanceof Error ? e.message : "desconocido");
    error = "&error=1";
  }
  revalidatePath("/simulador");
  redirect(`/simulador?tel=${telefono}${error}`);
}

export async function enviarTexto(telefono: string, formData: FormData) {
  const texto = String(formData.get("texto") ?? "").trim().slice(0, 1000);
  if (!texto) redirect(`/simulador?tel=${telefono}`);
  await simular(telefono, texto, { tipo: "texto", texto });
}

export async function enviarDocumento(telefono: string, formData: FormData) {
  const nombre = String(formData.get("documento") ?? "");
  if (!DOCUMENTOS_FICTICIOS.some((d) => d.archivo === nombre)) redirect(`/simulador?tel=${telefono}`);
  // El worker lo toma de su carpeta worker/entrada (PERMITIR_FUENTE_LOCAL=1). Nada se sube a la nube.
  await simular(telefono, `📎 ${nombre}`, { tipo: "media", mediaId: `local:${nombre}` });
}

export async function enviarAudio(telefono: string) {
  await simular(telefono, "🎤 Nota de voz", { tipo: "audio" });
}

/** Borra el chat simulado y la conversación de ese número. La solicitud (si existe) sigue en la lista. */
export async function reiniciar(telefono: string) {
  await preparar(telefono);
  const db = crearClienteAdmin();
  await db.from("mensajes_simulador").delete().eq("telefono", telefono);
  await db.from("conversaciones").delete().eq("telefono", telefono);
  revalidatePath("/simulador");
  redirect(`/simulador?tel=${telefono}`);
}
