// Uso: npx tsx --env-file=.env.local scripts/probar-finales.mts  (requiere MODO_SIMULACION=1)
// Prueba de integración del flujo por tipo (docs/superpowers/specs/2026-11-24-flujo-conversacion-bot.md):
// recorre cada final contra la base real con datos ficticios y los borra al terminar.
import { manejarEntrada } from "../lib/bot/servicio";
import type { Entrada } from "../lib/bot/motor";
import { crearClienteAdmin } from "../lib/supabase/admin";

const db = crearClienteAdmin();
const t = (texto: string): Entrada => ({ tipo: "texto", texto });
const m = (archivo: string): Entrada => ({ tipo: "media", mediaId: `local:${archivo}` });
/** Elige del último menú la opción cuyo texto contiene `nombre`. */
const opcion = (nombre: string) => ({ opcion: nombre });
type Paso = Entrada | { opcion: string };

const datos = (doc: string, nombre: string, eps: string, edad: string): Paso[] => [
  t("Hola"), t("sí"), t(doc), t(nombre), t(eps), t(edad),
];

const casos: { nombre: string; tel: string; pasos: Paso[] }[] = [
  { nombre: "1 · Sin autorización", tel: "573000000081", pasos: [t("Hola"), t("no")] },
  { nombre: "2 · EPS fuera de alcance", tel: "573000000082", pasos: [t("Hola"), t("sí"), t("1000000082"), t("Ana Prueba Dos"), t("3"), t("Nueva EPS")] },
  { nombre: "3 · Menor de 16 con especialista", tel: "573000000083",
    pasos: [...datos("1000000083", "Luis Prueba Tres", "2", "15"), opcion("Especialistas"), opcion("Fisiatría")] },
  { nombre: "4 · Terapia con más de 20 días", tel: "573000000084",
    pasos: [...datos("1000000084", "Rosa Prueba Cuatro", "2", "50"), opcion("Terapia física"), t("hace 4 semanas")] },
  { nombre: "5 · Valoración sin orden", tel: "573000000085",
    pasos: [...datos("1000000085", "Juan Prueba Cinco", "1", "40"), opcion("Valoración de fisioterapia"), t("no la tengo")] },
  { nombre: "6a · Registrada: terapia (continuidad)", tel: "573000000086",
    pasos: [...datos("1000000086", "Eva Prueba Seis", "1", "40"), opcion("Terapia física"), t("hace 5 días"), m("orden_clara.png"), t("1"), t("ninguna")] },
  { nombre: "6b · Registrada: fono SOS con OPS", tel: "573000000087",
    pasos: [...datos("1000000087", "Teo Prueba Siete", "2", "8"), opcion("Valoración de fonoaudiología"), m("orden_clara.png"), m("autorizacion_usada.png"), t("1"), t("ninguna")] },
  { nombre: "6c · Registrada: especialista adulto", tel: "573000000088",
    pasos: [...datos("1000000088", "Ana Prueba Ocho", "2", "45"), opcion("Especialistas"), opcion("Ortopedia"), m("orden_clara.png"), m("historia_p1de3.png"), t("listo"), t("1"), t("ninguna")] },
  { nombre: "7 · Desiste", tel: "573000000089", pasos: [...datos("1000000089", "Leo Prueba Nueve", "1", "30"), t("cancelar")] },
];

async function ultimoMensaje(tel: string): Promise<string> {
  const { data } = await db.from("mensajes_simulador").select("texto").eq("telefono", tel).eq("direccion", "SALIENTE").order("id", { ascending: false }).limit(1);
  return data?.[0]?.texto ?? "";
}

const solicitudes: string[] = [];

for (const caso of casos) {
  await db.from("mensajes_simulador").delete().eq("telefono", caso.tel);
  await db.from("conversaciones").delete().eq("telefono", caso.tel);
  for (const p of caso.pasos) {
    let entrada: Entrada;
    if ("opcion" in p) {
      const linea = (await ultimoMensaje(caso.tel)).split("\n").find((l) => l.includes(p.opcion));
      if (!linea) throw new Error(`${caso.nombre}: no aparece «${p.opcion}» en el menú`);
      entrada = t(linea.split(".")[0].trim());
    } else entrada = p;
    await db.from("mensajes_simulador").insert({ telefono: caso.tel, direccion: "ENTRANTE", texto: "texto" in entrada ? entrada.texto : "📎" });
    await manejarEntrada(caso.tel, entrada, "simulador");
  }
  const { data: conv } = await db.from("conversaciones").select("paso, solicitud_id").eq("telefono", caso.tel).maybeSingle();
  const { data: s } = conv?.solicitud_id
    ? await db.from("solicitudes").select("id, servicio_texto, ultima_asistencia, plan_estado, autorizacion_estado, historia_estado").eq("id", conv.solicitud_id).single()
    : { data: null };
  if (s) solicitudes.push(s.id);
  const { data: alertas } = s ? await db.from("alertas").select("codigo").eq("solicitud_id", s.id) : { data: [] };
  const { data: cola } = s ? await db.from("trabajos_ocr").select("tipo_documento").eq("solicitud_id", s.id).order("id") : { data: [] };
  console.log(`\n${caso.nombre}\n  paso: ${conv?.paso ?? "(conversación descartada)"}`);
  if (s) console.log(`  servicio: ${s.servicio_texto ?? "—"} · última asistencia: ${s.ultima_asistencia ?? "—"} · plan: ${s.plan_estado} · OPS: ${s.autorizacion_estado}`);
  console.log(`  alertas: ${(alertas ?? []).map((a) => a.codigo).join(", ") || "—"} · documentos: ${(cola ?? []).map((c) => c.tipo_documento).join(", ") || "—"}`);
  console.log(`  bot: ${(await ultimoMensaje(caso.tel)).replace(/\n/g, " | ").slice(0, 160)}`);
}

// Limpieza: todo es ficticio.
for (const id of solicitudes) {
  await db.from("trabajos_ocr").delete().eq("solicitud_id", id);
  await db.from("alertas").delete().eq("solicitud_id", id);
  await db.from("solicitudes").delete().eq("id", id);
}
for (const c of casos) {
  await db.from("conversaciones").delete().eq("telefono", c.tel);
  await db.from("mensajes_simulador").delete().eq("telefono", c.tel);
}
console.log("\n(datos de prueba borrados)");
