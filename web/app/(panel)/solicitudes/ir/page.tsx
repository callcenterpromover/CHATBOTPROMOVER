import { redirect } from "next/navigation";
import { requerirSesion } from "@/lib/supabase/server";

/** «Ir a solicitud» de la barra superior: busca por número (no es un dato personal) y abre el detalle.
 *  Respeta la visibilidad por rol: si la persona no puede ver la solicitud, se trata como no encontrada. */
export default async function IrASolicitud({ searchParams }: PageProps<"/solicitudes/ir">) {
  const sp = await searchParams;
  const numero = Number(String(Array.isArray(sp.numero) ? sp.numero[0] : (sp.numero ?? "")).replace(/\D/g, ""));
  const { supabase } = await requerirSesion();
  if (numero > 0) {
    const { data } = await supabase.from("solicitudes").select("id").eq("numero", numero).maybeSingle();
    if (data?.id) redirect(`/solicitudes/${data.id}`);
  }
  redirect("/lista-espera?aviso=no_encontrada");
}
