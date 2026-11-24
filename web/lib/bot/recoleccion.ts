// Flujo corto (PROMOVER, 2026-11-24): un saludo pide todo de una vez, el paciente envía datos y
// documentos sin preguntas intermedias y el bot solo vuelve a escribir cuando todo llegó, o si
// después de media hora sigue faltando algo. Funciones puras.

export const MINUTOS_ESPERA = 30;

export type DocumentoRecibido = { tipo_documento: string; estado: string };
export type DatosRecoleccion = { documento?: string | null; nombre?: string | null };

const PALABRAS_VACIAS = new Set([
  "hola", "buenas", "buenos", "buen", "dia", "dias", "tarde", "tardes", "noche", "noches", "gracias", "cita", "citas",
  "quiero", "necesito", "solicito", "solicitar", "una", "un", "por", "favor", "mi", "nombre", "es", "cedula", "cc", "c",
  "documento", "numero", "soy", "me", "llamo", "el", "la", "de", "del", "paciente", "se", "y", "con", "para", "terapia",
  "terapias", "orden", "historia", "clinica", "adjunto", "envio", "aqui", "esta", "estan", "ok", "listo", "si", "no",
]);

const sinTildes = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "");

/** Número de documento escrito en el texto (6 a 11 dígitos, con o sin puntos). */
export function extraerDocumento(texto: string): string | null {
  const m = texto.match(/(?<![\d.])(\d{1,3}(?:[.\s]\d{3}){1,3}|\d{6,11})(?![\d.])/);
  if (!m) return null;
  const digitos = m[1].replace(/\D/g, "");
  return digitos.length >= 6 && digitos.length <= 11 ? digitos : null;
}

/** Nombre completo escrito en el texto: lo que queda sin números ni palabras de saludo, si son 2 a 6 palabras. */
export function extraerNombre(texto: string): string | null {
  const palabras = texto
    .replace(/[\d.,;:!?¡¿()"'*_/-]+/g, " ")
    .split(/\s+/)
    .filter((p) => p && /^[\p{L}]+$/u.test(p) && !PALABRAS_VACIAS.has(sinTildes(p).toLowerCase()));
  if (palabras.length < 2 || palabras.length > 6 || palabras.some((p) => p.length < 2)) return null;
  return palabras.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

export type Estado =
  | { tipo: "COMPLETA" }
  | { tipo: "LEYENDO" } // hay documentos sin leer todavía
  | { tipo: "EN_REVISION"; faltanDatos: string[] } // hay documentos que el sistema no identificó: decide el equipo
  | { tipo: "FALTAN"; faltan: string[] };

/** ¿Llegó todo? Completa = documento + nombre + (plan de tratamiento) o (orden + historia).
 *  Nunca dice que falta un documento si hay alguno que el sistema no pudo identificar. */
export function estadoRecoleccion(d: DatosRecoleccion, docs: DocumentoRecibido[]): Estado {
  const faltanDatos = [...(d.documento ? [] : ["el número de cédula"]), ...(d.nombre ? [] : ["el nombre completo"])];
  const leidos = docs.filter((x) => x.estado === "COMPLETADO");
  const tipos = new Set(leidos.map((x) => x.tipo_documento));
  const docsOk = tipos.has("PLAN") || (tipos.has("ORDEN") && tipos.has("HISTORIA"));
  if (docsOk && !faltanDatos.length) return { tipo: "COMPLETA" };
  if (docs.some((x) => x.estado === "PENDIENTE" || x.estado === "EN_PROCESO")) return { tipo: "LEYENDO" };
  if (!docsOk && leidos.some((x) => x.tipo_documento === "DESCONOCIDO" || x.tipo_documento === "AUTORIZACION")) {
    return { tipo: "EN_REVISION", faltanDatos };
  }
  const faltanDocs = docsOk
    ? []
    : tipos.has("ORDEN")
      ? ["la historia clínica"]
      : tipos.has("HISTORIA")
        ? ["la orden médica"]
        : ["la orden médica", "la historia clínica (o, si ya estás en terapias, solo el plan de tratamiento)"];
  return { tipo: "FALTAN", faltan: [...faltanDatos, ...faltanDocs] };
}

/** ¿El paciente pregunta por su proceso? («¿qué falta?», «¿cómo va mi solicitud?», «¿ya me llamaron?»…). */
export function esPreguntaDeEstado(texto: string): boolean {
  const t = sinTildes(texto).toLowerCase();
  return /\?|\b(falta|faltan|estado|proceso|como va|que paso|novedad|respuesta|solicitud|ya me|cuando)\b/.test(t);
}

export function minutosDesde(inicioIso: string | undefined, ahoraIso: string): number {
  if (!inicioIso) return Infinity;
  return (new Date(ahoraIso).getTime() - new Date(inicioIso).getTime()) / 60_000;
}

/** «a, b y c». */
export function enumerar(lista: string[]): string {
  return lista.length <= 1 ? (lista[0] ?? "") : `${lista.slice(0, -1).join(", ")} y ${lista.at(-1)}`;
}
