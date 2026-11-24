// Qué pide el bot según el tipo de solicitud (docs/superpowers/specs/2026-11-24-flujo-conversacion-bot.md).
// Funciones puras: el tipo sale del servicio elegido en el menú (catálogo de Agendas).

import type { ServicioCita } from "../horarios";

export type ClaseServicio = "TERAPIA" | "VALORACION" | "ESPECIALISTA";

/** Días máximos sin asistir para seguir en continuidad (PROMOVER, 2026-11; Salud Total y SOS). */
export const DIAS_MAX_INASISTENCIA = 20;
/** Mayoría de edad: «menor» para exigir OPS. */
export const EDAD_MAYORIA = 18;

const sinTildes = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Especialistas = menú de especialistas. Valoración = el nombre o el código lo dicen. El resto
 *  (terapia física, respiratoria, de fonoaudiología, ocupacional) es continuidad de terapia. */
export function claseServicio(s: Pick<ServicioCita, "codigo" | "nombre" | "menu">): ClaseServicio {
  if (s.menu === "ESPECIALISTAS") return "ESPECIALISTA";
  if (/^VAL_/.test(s.codigo) || /^valoracion\b/.test(sinTildes(s.nombre))) return "VALORACION";
  return "TERAPIA";
}

/** Historia clínica: especialistas y valoración de fisioterapia (su orden suele ser «consulta de
 *  ingreso modelo fisioterapia y rehabilitación», que se decide con la sección de análisis y manejo). */
export function requiereHistoria(s: Pick<ServicioCita, "codigo" | "nombre" | "menu">): boolean {
  const clase = claseServicio(s);
  return clase === "ESPECIALISTA" || (clase === "VALORACION" && /fisioterapia/.test(sinTildes(s.nombre)));
}

/** OPS (solo SOS). CONDICIONAL: menores siempre; en adultos depende del diagnóstico o la IPS y la
 *  verifica el equipo, así que el bot no la pide. */
export function requiereOps(
  s: Pick<ServicioCita, "autorizacion_sos">,
  eps: string | null | undefined,
  edad: number | null | undefined,
): boolean {
  if (eps !== "SOS") return false;
  const menor = edad != null && edad < EDAD_MAYORIA;
  switch (s.autorizacion_sos) {
    case "SIEMPRE":
      return true;
    case "MENORES":
    case "CONDICIONAL":
      return menor;
    default:
      return false;
  }
}

const MESES: Record<string, number> = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, may: 5, mayo: 5, jun: 6, junio: 6,
  jul: 7, julio: 7, ago: 8, agosto: 8, sep: 9, sept: 9, septiembre: 9, set: 9, oct: 10, octubre: 10,
  nov: 11, noviembre: 11, dic: 12, diciembre: 12,
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Fecha de última asistencia escrita por el paciente: «15/11», «15/11/2026», «15 de noviembre»,
 *  «hoy», «ayer», «hace 3 días», «hace 2 semanas». Devuelve aaaa-mm-dd o null si no se entiende
 *  o es futura. No adivina: un texto ambiguo devuelve null y el bot vuelve a preguntar. */
export function interpretarUltimaAsistencia(texto: string, ahoraIso: string): string | null {
  const t = sinTildes(texto).replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  const hoy = new Date(ahoraIso.slice(0, 10) + "T00:00:00Z");
  const restar = (dias: number) => iso(new Date(hoy.getTime() - dias * 86_400_000));

  if (/^hoy$/.test(t)) return iso(hoy);
  if (/^ayer$/.test(t)) return restar(1);
  if (/^antier|^anteayer$/.test(t)) return restar(2);
  let m = /^hace (\d{1,3}) (dia|dias|semana|semanas|mes|meses)$/.exec(t);
  if (m) {
    const n = Number(m[1]);
    const dias = m[2].startsWith("dia") ? n : m[2].startsWith("semana") ? n * 7 : n * 30;
    return restar(dias);
  }
  if (/^hace (un|una) (dia|semana|mes)$/.test(t)) {
    return restar(t.endsWith("dia") ? 1 : t.endsWith("semana") ? 7 : 30);
  }

  let dia: number, mes: number, anio: number | undefined;
  if ((m = /^(\d{1,2}) ?[/-] ?(\d{1,2})(?: ?[/-] ?(\d{2,4}))?$/.exec(t))) {
    [dia, mes] = [Number(m[1]), Number(m[2])];
    if (m[3]) anio = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
  } else if ((m = /^(?:el )?(\d{1,2}) (?:de )?([a-z]+)(?: (?:de |del )?(\d{4}))?$/.exec(t)) && MESES[m[2]]) {
    [dia, mes] = [Number(m[1]), MESES[m[2]]];
    if (m[3]) anio = Number(m[3]);
  } else {
    return null;
  }
  // Sin año: el más reciente que no quede en el futuro.
  const anioActual = hoy.getUTCFullYear();
  const candidato = (a: number) => new Date(Date.UTC(a, mes - 1, dia));
  let fecha = candidato(anio ?? anioActual);
  if (fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null; // 31/02
  if (!anio && fecha > hoy) fecha = candidato(anioActual - 1);
  if (fecha > hoy) return null;
  return iso(fecha);
}

export function diasDesde(fechaIso: string, ahoraIso: string): number {
  const a = new Date(fechaIso + "T00:00:00Z").getTime();
  const b = new Date(ahoraIso.slice(0, 10) + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000);
}
