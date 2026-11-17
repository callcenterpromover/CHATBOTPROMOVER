// Uso: npx tsx --env-file=.env.local scripts/probar-conversacion.mts  (requiere MODO_SIMULACION=1)
// Prueba de integración: conversación simulada completa contra la base real (datos ficticios).
import { manejarEntrada } from "../lib/bot/servicio";
import type { Entrada } from "../lib/bot/motor";
import { crearClienteAdmin } from "../lib/supabase/admin";

const TEL = "573000000077";
const t = (texto: string): Entrada => ({ tipo: "texto", texto });
const m = (archivo: string): Entrada => ({ tipo: "media", mediaId: `local:${archivo}` });

const pasos: [string, Entrada][] = [
  ["Hola, necesito una cita", t("Hola, necesito una cita")],
  ["📎 orden_clara.png (antes de autorizar)", m("orden_clara.png")],
  ["sí", t("sí")],
  ["1.000.000.077", t("1.000.000.077")],
  ["si", t("si")],
  ["Carlos Prueba Setenta (ficticio)", t("Carlos Prueba Setenta (ficticio)")],
  ["🎤 audio", { tipo: "audio" }],
  ["Carlos Prueba Setenta", t("Carlos Prueba Setenta")],
  ["2", t("2")],
  ["67", t("67")],
  ["9 (opción inexistente)", t("9")],
  ["4", t("4")],
  ["📎 orden_borrosa.jpg", m("orden_borrosa.jpg")],
  ["📎 historia_p1de3.png", m("historia_p1de3.png")],
  ["LISTO", t("LISTO")],
  ["sí", t("sí")],
  ["no tengo", t("no tengo")],
  ["2", t("2")],
  ["1", t("1")],
];

const db = crearClienteAdmin();
await db.from("mensajes_simulador").delete().eq("telefono", TEL);
await db.from("conversaciones").delete().eq("telefono", TEL);

for (const [registro, entrada] of pasos) {
  await db.from("mensajes_simulador").insert({ telefono: TEL, direccion: "ENTRANTE", texto: registro });
  await manejarEntrada(TEL, entrada, "simulador");
}

const { data: conv } = await db.from("conversaciones").select("paso, solicitud_id").eq("telefono", TEL).single();
console.log("paso final:", conv?.paso);
const { data: s } = await db.from("solicitudes").select("*").eq("id", conv!.solicitud_id).single();
console.log("solicitud:", JSON.stringify({
  numero: s.numero, estado: s.estado, documento: s.documento, nombre: s.nombre, eps: s.eps, servicio: s.servicio_texto, servicio_cita_id: s.servicio_cita_id,
  edad: s.edad, terapia_previa: s.terapia_previa, plan: s.plan_estado, preferencia: s.preferencia_horario,
  factores: s.factores, consentimiento: Boolean(s.consentimiento_en), creada_antes_de_consentir: s.creada_en < s.consentimiento_en,
}));
const { data: tr } = await db.from("trabajos_ocr").select("media_id, tipo_documento, estado").eq("solicitud_id", s.id).order("id");
console.log("cola:", JSON.stringify(tr));
const { data: msgs } = await db.from("mensajes_simulador").select("direccion, texto").eq("telefono", TEL).order("id");
for (const x of msgs ?? []) console.log(x.direccion === "ENTRANTE" ? "\n👤" : "🤖", x.texto.replace(/\n/g, " | ").slice(0, 150));

if (process.argv.includes("--limpiar")) {
  await db.from("trabajos_ocr").delete().eq("solicitud_id", s.id);
  await db.from("conversaciones").delete().eq("telefono", TEL);
  await db.from("mensajes_simulador").delete().eq("telefono", TEL);
  await db.from("solicitudes").delete().eq("id", s.id);
  console.log("(datos de prueba borrados)");
}
