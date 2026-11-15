// Envío de mensajes al paciente. En WhatsApp real usa la API de Meta; en el simulador guarda la
// respuesta en `mensajes_simulador` para mostrarla en el panel. En WhatsApp real no se guarda nada.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Canal } from "./motor";

export function modoSimulacion() {
  return process.env.MODO_SIMULACION === "1";
}

async function enviarWhatsApp(telefono: string, texto: string) {
  const token = process.env.META_WHATSAPP_TOKEN;
  const numeroId = process.env.META_PHONE_NUMBER_ID;
  const version = process.env.META_API_VERSION ?? "v23.0";
  if (!token || !numeroId) throw new Error("falta_configuracion_meta");

  const r = await fetch(`https://graph.facebook.com/${version}/${numeroId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: telefono,
      type: "text",
      text: { body: texto, preview_url: false },
    }),
  });
  if (!r.ok) throw new Error(`meta_envio_${r.status}`);
}

export async function enviar(db: SupabaseClient, canal: Canal, telefono: string, textos: string[]) {
  if (!textos.length) return;
  if (canal === "simulador") {
    if (!modoSimulacion()) throw new Error("simulador_desactivado");
    const { error } = await db
      .from("mensajes_simulador")
      .insert(textos.map((texto) => ({ telefono, direccion: "SALIENTE", texto })));
    if (error) throw new Error("simulador_guardar");
    return;
  }
  for (const texto of textos) await enviarWhatsApp(telefono, texto); // en orden
}
