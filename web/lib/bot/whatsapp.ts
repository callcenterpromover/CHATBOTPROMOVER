// Utilidades del webhook de Meta (WhatsApp Cloud API). Sin dependencias de Next para poder probarlas.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Entrada } from "./motor";

/** Verifica la cabecera X-Hub-Signature-256 (HMAC-SHA256 del cuerpo con el App Secret). */
export function firmaValida(cuerpo: string, firma: string | null, secreto: string | undefined): boolean {
  if (!firma || !secreto || !firma.startsWith("sha256=")) return false;
  const esperada = createHmac("sha256", secreto).update(cuerpo, "utf8").digest("hex");
  const a = Buffer.from(firma.slice(7), "hex");
  const b = Buffer.from(esperada, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type MensajeEntrante = { id: string; telefono: string; entrada: Entrada };

type MensajeMeta = {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string };
  document?: { id?: string };
  audio?: { id?: string };
};

/** Extrae los mensajes del cuerpo del webhook. Ignora estados (entregado/leído) y otros números. */
export function extraerMensajes(cuerpo: unknown, numeroId: string | undefined): MensajeEntrante[] {
  const salida: MensajeEntrante[] = [];
  const entradas = (cuerpo as { entry?: { changes?: { field?: string; value?: unknown }[] }[] })?.entry ?? [];
  for (const entry of entradas) {
    for (const cambio of entry.changes ?? []) {
      if (cambio.field !== "messages") continue;
      const valor = cambio.value as { metadata?: { phone_number_id?: string }; messages?: MensajeMeta[] };
      if (numeroId && valor?.metadata?.phone_number_id !== numeroId) continue;
      for (const m of valor?.messages ?? []) {
        if (!m.id || !m.from || !/^\d{8,15}$/.test(m.from)) continue;
        let entrada: Entrada;
        if (m.type === "text" && m.text?.body) entrada = { tipo: "texto", texto: m.text.body.slice(0, 1000) };
        else if (m.type === "image" && m.image?.id) entrada = { tipo: "media", mediaId: m.image.id };
        else if (m.type === "document" && m.document?.id) entrada = { tipo: "media", mediaId: m.document.id };
        else if (m.type === "audio") entrada = { tipo: "audio" };
        else entrada = { tipo: "otro" };
        salida.push({ id: m.id, telefono: m.from, entrada });
      }
    }
  }
  return salida;
}
