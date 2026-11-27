"use server";

import { revalidatePath } from "next/cache";
import { requerirRol } from "@/lib/supabase/server";

export type ClaveConfiguracion = "bot" | "ocr" | "simulacion";
export type ResultadoInterruptor = { activo: boolean; aviso: { tono: "ok" | "error"; texto: string } | null };

const AVISOS: Record<ClaveConfiguracion, { encendido: string; apagado: string }> = {
  bot: {
    encendido: "Bot de WhatsApp encendido: responde automáticamente a los pacientes.",
    apagado: "Bot de WhatsApp pausado: no responderá mensajes hasta que lo enciendas.",
  },
  ocr: {
    encendido: "OCR reanudado: el lector vuelve a tomar los documentos en cola.",
    apagado: "OCR pausado: los documentos quedan en cola hasta que lo reanudes.",
  },
  simulacion: {
    encendido: "Modo simulación encendido: el simulador de WhatsApp está disponible en el menú.",
    apagado: "Modo simulación apagado: el simulador ya no está disponible.",
  },
};

/** Enciende o apaga el bot, el OCR o el modo simulación. Solo super_admin (la base también lo verifica). */
export async function cambiarConfiguracion(previo: ResultadoInterruptor, formData: FormData): Promise<ResultadoInterruptor> {
  const { supabase } = await requerirRol(["super_admin"]);
  const clave = formData.get("clave");
  if (clave !== "bot" && clave !== "ocr" && clave !== "simulacion") return previo;
  const activo = formData.get("activo") === "1";
  const { error } = await supabase.rpc("cambiar_configuracion", { p_clave: clave, p_valor: activo });
  if (error) return { activo: !activo, aviso: { tono: "error", texto: "No se pudo guardar el cambio. Intenta de nuevo." } };
  revalidatePath("/", "layout");
  return { activo, aviso: { tono: "ok", texto: activo ? AVISOS[clave].encendido : AVISOS[clave].apagado } };
}
