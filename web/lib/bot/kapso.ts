// Integración con Kapso (proveedor de WhatsApp). Sin dependencias de Next para poder probarla.
// Documentación: docs.kapso.ai — webhooks (message-events, security) y proxy de Meta.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Entrada } from "./motor";
import { TIPOS_IGNORADOS } from "./whatsapp";

export const KAPSO_API = "https://api.kapso.ai/meta/whatsapp/v24.0";

/** X-Webhook-Signature: HMAC-SHA256 en hexadecimal del cuerpo crudo, con el secreto del webhook. */
export function firmaKapsoValida(cuerpo: string, firma: string | null, secreto: string | undefined): boolean {
  if (!firma || !secreto || !/^[0-9a-f]{64}$/i.test(firma)) return false;
  const esperada = createHmac("sha256", secreto).update(cuerpo, "utf8").digest();
  const recibida = Buffer.from(firma, "hex");
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}

export type MensajeKapso = { id: string; telefono: string; entrada: Entrada };

type MediaMeta = { id?: string };
type EventoKapso = {
  phone_number_id?: string;
  message?: {
    id?: string;
    from?: string;
    type?: string;
    text?: { body?: string };
    image?: MediaMeta;
    document?: MediaMeta;
    audio?: MediaMeta;
    kapso?: { direction?: string };
  };
  conversation?: { phone_number?: string; phone_number_id?: string };
};

/** Lee el cuerpo de `whatsapp.message.received` (individual o en lote) y devuelve los mensajes entrantes. */
export function extraerMensajesKapso(cuerpo: unknown, numeroId: string | undefined): MensajeKapso[] {
  const raiz = cuerpo as { batch?: boolean; data?: unknown[] } & EventoKapso;
  const eventos: EventoKapso[] = raiz?.batch && Array.isArray(raiz.data) ? (raiz.data as EventoKapso[]) : [raiz];
  const salida: MensajeKapso[] = [];

  for (const ev of eventos) {
    const m = ev?.message;
    if (!m?.id) continue;
    const numero = ev.phone_number_id ?? ev.conversation?.phone_number_id;
    if (numeroId && numero !== numeroId) continue; // otro número de la cuenta
    if (m.kapso?.direction && m.kapso.direction !== "inbound") continue;
    if (m.type && TIPOS_IGNORADOS.has(m.type)) continue;

    const telefono = (m.from ?? ev.conversation?.phone_number ?? "").replace(/\D/g, "");
    if (!/^\d{8,15}$/.test(telefono)) continue;

    let entrada: Entrada;
    const media = m.type === "image" ? m.image?.id : m.type === "document" ? m.document?.id : undefined;
    if (m.type === "text" && m.text?.body) entrada = { tipo: "texto", texto: m.text.body.slice(0, 1000) };
    else if (media && /^\d{5,30}$/.test(media)) entrada = { tipo: "media", mediaId: `kapso:${media}` };
    else if (m.type === "audio") entrada = { tipo: "audio" };
    else entrada = { tipo: "otro" };

    salida.push({ id: m.id.slice(0, 200), telefono, entrada });
  }
  return salida;
}

/** IDs de número (phone_number_id) que trae el evento; sirven para diagnosticar una configuración errada. */
export function numerosDelEvento(cuerpo: unknown): string[] {
  const raiz = cuerpo as { batch?: boolean; data?: unknown[] } & EventoKapso;
  const eventos: EventoKapso[] = raiz?.batch && Array.isArray(raiz.data) ? (raiz.data as EventoKapso[]) : [raiz];
  const ids = eventos
    .map((ev) => ev?.phone_number_id ?? ev?.conversation?.phone_number_id)
    .filter((n): n is string => typeof n === "string" && /^\d{5,30}$/.test(n));
  return [...new Set(ids)];
}

/** Envía un texto por el proxy de Meta de Kapso. */
export async function enviarPorKapso(telefono: string, texto: string) {
  const clave = process.env.KAPSO_API_KEY;
  const numeroId = process.env.KAPSO_PHONE_NUMBER_ID;
  if (!clave || !numeroId) throw new Error("falta_configuracion_kapso");
  const r = await fetch(`${KAPSO_API}/${numeroId}/messages`, {
    method: "POST",
    headers: { "X-API-Key": clave, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: telefono,
      type: "text",
      text: { body: texto },
    }),
  });
  if (!r.ok) throw new Error(`kapso_envio_${r.status}`);
}
