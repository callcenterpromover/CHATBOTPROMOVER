"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirRol } from "@/lib/supabase/server";

const ORIGENES = new Set(["webhook", "envio", "bot", "ocr", "worker", "sistema"]);

/** Marca como revisados los registros abiertos de un código (o todos). Solo super_admin; la base lo verifica. */
export async function marcarRevisados(formData: FormData) {
  const { supabase } = await requerirRol(["super_admin"]);
  const origen = String(formData.get("origen") ?? "");
  const codigo = String(formData.get("codigo") ?? "").slice(0, 80);
  const { error } = await supabase.rpc("marcar_errores_revisados", {
    p_origen: ORIGENES.has(origen) ? origen : null,
    p_codigo: codigo || null,
  });
  revalidatePath("/admin/errores");
  redirect(`/admin/errores?${error ? "error=revisar" : codigo ? "ok=revisado" : "ok=todos"}`);
}
