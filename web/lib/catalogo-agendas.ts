// Lee de la base el catálogo de Agendas (servicios, franjas y edad de corte).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Catalogo, Franja, ServicioCita } from "./horarios";

export async function cargarCatalogo(db: SupabaseClient): Promise<Catalogo | null> {
  const [servicios, franjas, config] = await Promise.all([
    db.from("servicios_cita").select("*").order("orden").order("id"),
    db.from("franjas_horario").select("servicio_id, grupo_edad, dia_semana, hora_inicio, hora_fin").order("dia_semana").order("hora_inicio"),
    db.from("configuracion_agenda").select("edad_corte_ninos").eq("id", 1).maybeSingle(),
  ]);
  if (servicios.error || franjas.error) return null;
  return {
    servicios: (servicios.data ?? []) as ServicioCita[],
    franjas: (franjas.data ?? []) as Franja[],
    edadCorteNinos: config.data?.edad_corte_ninos ?? 18,
  };
}
