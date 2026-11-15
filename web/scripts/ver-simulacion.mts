// Uso: npx tsx --env-file=.env.local scripts/ver-simulacion.mts [telefono]
// Muestra el estado de una conversación simulada (datos ficticios).
import { crearClienteAdmin } from "../lib/supabase/admin";

const tel = process.argv[2] ?? "573000000077";
const db = crearClienteAdmin();
const { data: conv } = await db.from("conversaciones").select("paso, solicitud_id").eq("telefono", tel).maybeSingle();
console.log("paso:", conv?.paso ?? "(sin conversación)");
if (conv?.solicitud_id) {
  const { data: s } = await db
    .from("solicitudes")
    .select("numero, estado, orden_estado, historia_estado, plan_estado, categoria_probable")
    .eq("id", conv.solicitud_id)
    .single();
  console.log("solicitud:", JSON.stringify(s));
  const { data: al } = await db.from("alertas").select("codigo").eq("solicitud_id", conv.solicitud_id).order("id");
  console.log("alertas:", (al ?? []).map((a) => a.codigo).join(", ") || "ninguna");
}
const { data: msgs } = await db
  .from("mensajes_simulador")
  .select("direccion, texto")
  .eq("telefono", tel)
  .order("id", { ascending: false })
  .limit(3);
for (const m of (msgs ?? []).reverse()) console.log(m.direccion === "ENTRANTE" ? "👤" : "🤖", m.texto.replace(/\n/g, " | ").slice(0, 200));
