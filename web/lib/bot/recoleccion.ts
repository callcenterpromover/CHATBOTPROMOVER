// Flujo corto (PROMOVER, 2026-11-24): un saludo pide todo de una vez, el paciente envía datos y
// documentos sin preguntas intermedias y el bot solo vuelve a escribir cuando todo llegó, o si
// después de media hora sigue faltando algo. Funciones puras.

export const MINUTOS_ESPERA = 30;

export type DocumentoRecibido = { tipo_documento: string; estado: string };
export type DatosRecoleccion = { documento?: string | null; nombre?: string | null };

// Palabras que nunca forman parte de un nombre. Si una línea sin marcador («me llamo…») contiene
// alguna, no se toma como nombre: es mejor dejar el nombre sin leer que guardar uno falso.
const PALABRAS_VACIAS = new Set([
  "hola", "buenas", "buenos", "buen", "dia", "dias", "tarde", "tardes", "noche", "noches", "gracias", "muchas",
  "cita", "citas", "quiero", "quisiera", "necesito", "solicito", "solicitar", "agendar", "agenda", "pedir", "una", "un",
  "por", "favor", "porfa", "porfavor", "mi", "mis", "su", "sus", "nombre", "completo", "es", "cedula", "cc", "ti", "c",
  "documento", "documentos", "numero", "soy", "me", "te", "le", "lo", "les", "llamo", "el", "se", "y", "o", "con",
  "para", "en", "al", "a", "que", "cual", "cuanto", "cuando", "como", "donde", "ya", "mas", "pero", "tengo", "tiene",
  "paciente", "terapia", "terapias", "fisioterapia", "fisica", "ocupacional", "lenguaje", "valoracion", "control",
  "orden", "medica", "historia", "clinica", "plan", "tratamiento", "autorizacion", "eps", "foto", "fotos", "pdf",
  "adjunto", "adjunta", "adjuntos", "envio", "envie", "enviar", "envia", "mando", "aqui", "aca", "ahi", "esta", "estan",
  "este", "esto", "ok", "listo", "lista", "si", "no", "bien", "vale", "perfecto", "claro", "todo", "nada", "nueva",
  "cancelar", "urgente", "ayuda", "informacion", "demora", "mama", "papa", "hijo", "hija", "esposo", "esposa",
  "senor", "senora", "sr", "sra", "puedo", "puede", "pueden", "celular", "telefono", "cel", "tel", "whatsapp",
]);
// Partículas que van dentro de un nombre («María de los Ángeles»), nunca al principio ni al final.
const CONECTORES = new Set(["de", "del", "la", "las", "los", "san"]);
const SALUDO_INICIAL = /^(?:(?:hola|buenas|buenos|buen|dias?|tardes?|noches?)[\s,.!¡]*)+/u;
const MARCADOR_NOMBRE = /(?:me llamo|mi nombre(?: completo)? es|nombre(?: completo)?(?: del paciente)?\s*(?:es|[:=])|el paciente es|paciente\s*[:=]|soy)\s+(.+)/u;

const sinTildes = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "");
const clave = (p: string) => sinTildes(p).toLowerCase();
const capitalizar = (p: string) =>
  CONECTORES.has(clave(p)) ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();

// Antes de un número, estas palabras dicen que no es la cédula (celular, orden, autorización…).
const NO_ES_CEDULA = /(?:cel|celular|tel|telefono|whatsapp|contacto|orden|autorizacion|radicado|nit|historia|edad)\W*(?:\w+\W+){0,2}$/;

/** Número de cédula escrito en el texto (6 a 11 dígitos, con o sin puntos o espacios).
 *  No toma celulares (10 dígitos que empiezan por 3) ni números que el texto presenta como otra cosa. */
export function extraerDocumento(texto: string): string | null {
  const re = /(?<![\d.])(\d{1,3}(?:[.\s]\d{3}){1,3}|\d{6,11})(?![\d.])/g;
  for (const m of texto.matchAll(re)) {
    const digitos = m[1].replace(/\D/g, "");
    if (digitos.length < 6 || digitos.length > 11) continue;
    if (digitos.length === 10 && digitos.startsWith("3")) continue; // celular colombiano
    const antes = clave(texto.slice(0, m.index).split(/[\n,;\d]/).at(-1) ?? ""); // desde el número o la coma anterior
    if (NO_ES_CEDULA.test(antes)) continue;
    return digitos;
  }
  return null;
}

/** Palabras (solo letras) de un trozo de texto, sin números ni la sigla «CC». */
function palabras(trozo: string): string[] | null {
  const ps = trozo.replace(/[\d.,;:!¡()"'*_/-]+/g, " ").split(/\s+/).filter(Boolean);
  return ps.every((p) => /^\p{L}+$/u.test(p)) ? ps : null;
}

/** 2 a 6 palabras de nombre; los conectores solo en medio. */
function comoNombre(ps: string[]): string | null {
  const reales = ps.filter((p) => !CONECTORES.has(clave(p)));
  if (reales.length < 2 || reales.length > 6 || reales.some((p) => p.length < 2)) return null;
  if (CONECTORES.has(clave(ps[0])) || CONECTORES.has(clave(ps.at(-1)!))) return null;
  return ps.map(capitalizar).join(" ");
}

/** Nombre completo escrito en el texto, por línea:
 *  - después de «me llamo», «mi nombre es», «nombre:», «soy»…: las palabras que siguen, hasta la primera que no es de nombre;
 *  - sin marcador: solo si la línea es únicamente un nombre (quitando saludo inicial y cédula).
 *  Ante la duda devuelve null: el equipo completa el nombre en el panel. */
export function extraerNombre(texto: string): string | null {
  const lineas = texto.normalize("NFC").split(/[\n;]+/).map((l) => l.trim()).filter(Boolean);
  for (const linea of lineas) {
    const m = clave(linea).match(MARCADOR_NOMBRE);
    if (m) {
      // Se toma el texto original (con tildes) en la misma posición que la coincidencia.
      const resto = linea.slice(linea.length - m[1].length);
      const ps: string[] = [];
      for (const p of resto.split(/[\s,.!?¡¿]+/).filter(Boolean)) {
        if (/\d/.test(p) || /^c\.?c\.?$/i.test(p)) break;
        if (!/^\p{L}+$/u.test(p) || PALABRAS_VACIAS.has(clave(p))) break;
        ps.push(p);
      }
      while (ps.length && CONECTORES.has(clave(ps.at(-1)!))) ps.pop();
      const n = comoNombre(ps);
      if (n) return n;
      continue;
    }
    if (/[?¿]/.test(linea)) continue;
    const sinSaludo = linea.slice(clave(linea).match(SALUDO_INICIAL)?.[0].length ?? 0);
    const sinCedula = sinSaludo.replace(/\b(?:c\.?\s?c\.?|cedula|cédula)\b\.?:?/giu, " ");
    const ps = palabras(sinCedula);
    if (!ps || ps.some((p) => PALABRAS_VACIAS.has(clave(p)))) continue;
    const n = comoNombre(ps);
    if (n) return n;
  }
  return null;
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
