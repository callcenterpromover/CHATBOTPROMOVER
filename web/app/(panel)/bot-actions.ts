"use server";

import { revalidatePath } from "next/cache";
import { requerirRol } from "@/lib/supabase/server";

export type ResultadoBot = { activo: boolean; aviso: { tono: "ok" | "error"; texto: string } | null };

/** Encender o pausar el bot de WhatsApp. Solo super_admin (la base también lo verifica). */
export async function cambiarEstadoBot(_previo: ResultadoBot, formData: FormData): Promise<ResultadoBot> {
  const { supabase } = await requerirRol(["super_admin"]);
  const activo = formData.get("activo") === "1";
  const { error } = await supabase.rpc("cambiar_estado_bot", { p_activo: activo });
  if (error) {
    return { activo: !activo, aviso: { tono: "error", texto: "No se pudo cambiar el estado del bot. Intenta de nuevo." } };
  }
  revalidatePath("/", "layout");
  return {
    activo,
    aviso: activo
      ? { tono: "ok", texto: "Bot de WhatsApp encendido: responde automáticamente a los pacientes." }
      : { tono: "ok", texto: "Bot de WhatsApp pausado: no responderá mensajes hasta que lo enciendas." },
  };
}
