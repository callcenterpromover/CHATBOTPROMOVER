// Uso: npx tsx --env-file=.env.local scripts/probar-finales.mts  (requiere MODO_SIMULACION=1)
// Prueba de integración del flujo corto contra la base real, con datos ficticios que se borran al terminar.
import { manejarEntrada } from "../lib/bot/servicio";
import type { Entrada } from "../lib/bot/motor";
import { crearClienteAdmin } from "../lib/supabase/admin";

const db = crearClienteAdmin();
const TEL = "573000000091";
const t = (texto: string): Entrada => ({ tipo: "texto", texto });
const m = (archivo: string): Entrada => ({ tipo: "media", mediaId: `local:${archivo}` });

async function salientes(): Promise<string[]> {
  const { data } = await db.from("mensajes_simulador").select("texto").eq("telefono", TEL).eq("direccion", "SALIENTE").order("id");
  return (data ?? []).map((x) => x.texto);
}
async function paso(entrada: Entrada) {
  await db.from("mensajes_simulador").insert({ telefono: TEL, direccion: "ENTRANTE", texto: "texto" in entrada ? entrada.texto : "📎" });
  const antes = (await salientes()).length;
  await manejarEntrada(TEL, entrada, "simulador");
  return (await salientes()).slice(antes);
}

await db.from("mensajes_simulador").delete().eq("telefono", TEL);
await db.from("conversaciones").delete().eq("telefono", TEL);

console.log("1 · saludo:", (await paso(t("Hola, necesito una cita"))).map((x) => x.slice(0, 60)));
console.log("2 · datos (silencio):", await paso(t("1000000091 Ana Prueba Noventa")));
console.log("3 · documento (silencio):", await paso(m("orden_clara.png")));

const { data: conv } = await db.from("conversaciones").select("solicitud_id, datos").eq("telefono", TEL).single();
const { data: s } = await db.from("solicitudes").select("documento, nombre, estado").eq("id", conv!.solicitud_id).single();
console.log("   solicitud:", s);

// Simula que pasó media hora desde el saludo.
const viejo = new Date(Date.now() - 40 * 60_000).toISOString();
await db.from("conversaciones").update({ datos: { ...conv!.datos, inicio: viejo } }).eq("telefono", TEL);
console.log("4 · escribe después de 30 min:", await paso(t("hola?")));
console.log("5 · vuelve a escribir enseguida (silencio):", await paso(t("??")));

{
  await db.from("trabajos_ocr").delete().eq("solicitud_id", conv!.solicitud_id);
  await db.from("alertas").delete().eq("solicitud_id", conv!.solicitud_id);
  await db.from("solicitudes").delete().eq("id", conv!.solicitud_id);
  await db.from("conversaciones").delete().eq("telefono", TEL);
  await db.from("mensajes_simulador").delete().eq("telefono", TEL);
  console.log("(datos de prueba borrados)");
}
