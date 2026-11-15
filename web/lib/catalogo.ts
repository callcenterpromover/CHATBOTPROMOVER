// Catálogos y etiquetas. Los valores deben coincidir con los CHECK de la base.

export const EPS = {
  SALUD_TOTAL: "Salud Total",
  SOS: "SOS",
  OTRA: "Otra EPS",
  SIN_DEFINIR: "Sin definir",
} as const;

export const CATEGORIAS = {
  FISIOTERAPIA: "Fisioterapia",
  FONOAUDIOLOGIA: "Fonoaudiología",
  TERAPIA_OCUPACIONAL: "Terapia ocupacional",
  TERAPIA_RESPIRATORIA: "Terapia respiratoria",
  FISIATRIA: "Fisiatría",
  ORTOPEDIA: "Ortopedia",
  EQUIPO_INTERDISCIPLINARIO: "Equipo interdisciplinario",
  INFILTRACIONES: "Infiltraciones",
  FUERA_DE_ALCANCE: "Fuera de alcance",
  SIN_CLASIFICAR: "Sin clasificar",
} as const;

export const ESTADOS = {
  NUEVA: "Nueva",
  ESPERANDO_DATOS: "Esperando datos",
  ESPERANDO_ORDEN: "Esperando orden",
  ESPERANDO_HISTORIA: "Esperando historia",
  ESPERANDO_PLAN: "Esperando plan",
  DOCUMENTOS_POR_REENVIAR: "Documentos por reenviar",
  PENDIENTE_VERIFICACION_HUMANA: "Pendiente de verificación",
  LISTA_PARA_REVISION: "Lista para revisión",
} as const;

export const ESTADO_DOCUMENTAL = {
  COMPLETO: "Completo",
  INCOMPLETO: "Incompleto",
  POSIBLEMENTE_INCOMPLETA: "Posiblemente incompleta",
  DISCREPANCIA: "Discrepancia",
} as const;

export const ORDEN_ESTADO = {
  NO_RECIBIDA: "No recibida",
  RECIBIDA_PENDIENTE_REVISION: "Recibida, por revisar",
  ILEGIBLE: "Ilegible",
  LEGIBLE: "Legible",
  CONFIRMADA_HUMANAMENTE: "Confirmada por una persona",
} as const;

export const HISTORIA_ESTADO = {
  NO_RECIBIDA: "No recibida",
  RECIBIDA_PENDIENTE_REVISION: "Recibida, por revisar",
  POSIBLEMENTE_INCOMPLETA: "Posiblemente incompleta",
  ILEGIBLE: "Ilegible",
  COMPLETITUD_CONFIRMADA_HUMANAMENTE: "Completa (confirmada por una persona)",
} as const;

export const PLAN_ESTADO = {
  NO_REQUERIDO: "No requerido",
  REQUERIDO_PENDIENTE: "Requerido, pendiente",
  RECIBIDO: "Recibido",
} as const;

export const AUTORIZACION_ESTADO = {
  NO_DETERMINADA: "Sin determinar",
  NO_RECIBIDA: "No recibida",
  RECIBIDA: "Recibida",
  PENDIENTE_VERIFICACION_HUMANA: "Pendiente de verificación",
  POSIBLEMENTE_UTILIZADA: "Posiblemente utilizada",
} as const;

export const FACTORES = {
  FUERA_DE_CALI: "Vive fuera de Cali",
  MOVILIDAD_REDUCIDA: "Movilidad reducida",
  ADULTO_MAYOR: "Adulto mayor",
  EMBARAZO: "Embarazo",
} as const;

export const CAMPOS = {
  DOCUMENTO: "Documento",
  NOMBRE: "Nombre",
  EPS: "EPS",
  SERVICIO: "Servicio",
  DIAGNOSTICO: "Diagnóstico",
  FECHA_EMISION: "Fecha de emisión",
  FECHA_VENCIMIENTO: "Fecha de vencimiento",
  NUMERO_ORDEN: "N.º de orden / autorización",
} as const;

export const ORIGENES = {
  ORDEN: "Orden",
  HISTORIA: "Historia clínica",
  PLAN: "Plan de tratamiento",
  AUTORIZACION: "Autorización",
} as const;

export const VERIFICACION = {
  SIN_COMPARAR: "Sin comparar",
  COINCIDE: "Coincide",
  DISCREPANCIA: "No coincide",
  CORREGIDO_HUMANO: "Corregido por una persona",
} as const;

export const MOTIVOS_CIERRE = ["GESTIONADA", "CERRADA_DUPLICADA", "CERRADA_POR_USUARIO"] as const;

export type Tono = "ok" | "aviso" | "peligro" | "neutro" | "info";

export function etiqueta(mapa: Record<string, string>, valor: string | null | undefined) {
  if (!valor) return "—";
  return mapa[valor] ?? valor;
}

export function esValor<T extends Record<string, string>>(mapa: T, v: unknown): v is keyof T & string {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(mapa, v);
}

export function tonoEstadoDocumental(v: string): Tono {
  if (v === "COMPLETO") return "ok";
  if (v === "DISCREPANCIA") return "peligro";
  if (v === "POSIBLEMENTE_INCOMPLETA") return "aviso";
  return "neutro";
}

export function tonoEstado(v: string): Tono {
  if (v === "LISTA_PARA_REVISION") return "ok";
  if (v === "PENDIENTE_VERIFICACION_HUMANA") return "aviso";
  if (v === "DOCUMENTOS_POR_REENVIAR") return "peligro";
  return "info";
}

export type FilaLista = {
  id: string;
  numero: number;
  creada_en: string;
  ultima_interaccion: string;
  telefono: string | null;
  nombre: string | null;
  documento: string | null;
  eps: string;
  eps_texto: string | null;
  servicio_texto: string | null;
  categoria_probable: string;
  clasificacion_motivo: string | null;
  clasificacion_confianza: string | null;
  estado: string;
  orden_estado: string;
  historia_estado: string;
  plan_estado: string;
  autorizacion_estado: string;
  orden_vencimiento: string | null;
  orden_vencimiento_texto: string | null;
  orden_vencimiento_confianza: string | null;
  terapia_previa: string | null;
  preferencia_horario: string | null;
  edad: number | null;
  factores: string[];
  factores_origen: string | null;
  revision_humana: string;
  cita_previa_fecha: string | null;
  asignado_a: string | null;
  fecha_asignacion: string | null;
  estado_concurrencia: "LIBRE" | "BLOQUEADO";
  asignado_nombre: string | null;
  dias_espera: number;
  dias_para_vencer: number | null;
  alertas_abiertas: number;
  discrepancias: number;
  solicitudes_mismo_documento: number;
  estado_documental: string;
};

const fmtFecha = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium" });
const fmtFechaHora = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  dateStyle: "medium",
  timeStyle: "short",
});

export function fecha(v: string | null | undefined) {
  if (!v) return "—";
  // Las fechas sin hora (YYYY-MM-DD) se interpretan como día local, no UTC.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00-05:00`) : new Date(v);
  return fmtFecha.format(d);
}

export function fechaHora(v: string | null | undefined) {
  return v ? fmtFechaHora.format(new Date(v)) : "—";
}

/** En listados no se muestra el documento completo. */
export function documentoOculto(doc: string | null) {
  if (!doc) return "—";
  return doc.length <= 4 ? doc : `••••${doc.slice(-4)}`;
}

/** Texto normalizado para el buscador local del panel (sin tildes, en minúsculas). */
export function textoBusqueda(nombre: string | null, documento: string | null) {
  return `${nombre ?? ""} ${documento ?? ""}`
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export function codigoSolicitud(numero: number) {
  return `S-${String(numero).padStart(4, "0")}`;
}
