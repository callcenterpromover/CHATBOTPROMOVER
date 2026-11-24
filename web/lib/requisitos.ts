// Qué necesita una solicitud según su tipo (docs/superpowers/specs/2026-11-24-flujos-revision-aprendizaje-design.md §5).
// Usa las mismas reglas que el bot (lib/bot/flujo.ts) para que el panel muestre solo lo que aplica.

import { DIAS_MAX_INASISTENCIA, EDAD_MAYORIA, claseServicio, diasDesde, requiereHistoria, requiereOps, type ClaseServicio } from "./bot/flujo";
import type { ServicioCita } from "./horarios";

export type EstadoRequisito = "RECIBIDO" | "FALTA" | "VERIFICAR";
export type Requisito = {
  clave: "ORDEN" | "HISTORIA" | "OPS" | "PLAN" | "ULTIMA_ASISTENCIA";
  titulo: string;
  estado: EstadoRequisito;
  detalle: string;
};

export type DatosRequisitos = {
  eps: string | null;
  edad: number | null;
  orden_estado: string;
  historia_estado: string;
  plan_estado: string;
  autorizacion_estado: string;
  ultima_asistencia: string | null;
};

export const NOMBRE_CLASE: Record<ClaseServicio, string> = {
  TERAPIA: "Terapia (continuidad)",
  VALORACION: "Valoración",
  ESPECIALISTA: "Especialista",
};

/** Documentos de la solicitud que aplican a su tipo, con su estado. Sin servicio del catálogo (texto libre),
 *  se asume valoración: orden e historia. */
export function requisitos(d: DatosRequisitos, servicio: ServicioCita | null, hoyIso: string): Requisito[] {
  const clase = servicio ? claseServicio(servicio) : "VALORACION";
  const lista: Requisito[] = [];

  if (clase === "TERAPIA") {
    if (!d.ultima_asistencia) {
      lista.push({ clave: "ULTIMA_ASISTENCIA", titulo: "Última asistencia", estado: "FALTA", detalle: "Pregúntale al paciente la fecha de su última terapia." });
    } else {
      const dias = diasDesde(d.ultima_asistencia, hoyIso);
      lista.push(
        dias > DIAS_MAX_INASISTENCIA
          ? { clave: "ULTIMA_ASISTENCIA", titulo: "Última asistencia", estado: "VERIFICAR", detalle: `Hace ${dias} días: más de ${DIAS_MAX_INASISTENCIA}. Debe renovar el proceso con medicina general de su EPS.` }
          : { clave: "ULTIMA_ASISTENCIA", titulo: "Última asistencia", estado: "RECIBIDO", detalle: `Hace ${dias} ${dias === 1 ? "día" : "días"}.` },
      );
    }
    lista.push(
      d.plan_estado === "RECIBIDO"
        ? { clave: "PLAN", titulo: "Plan de tratamiento", estado: "RECIBIDO", detalle: "Recibido." }
        : { clave: "PLAN", titulo: "Plan de tratamiento", estado: "FALTA", detalle: "Pídelo por WhatsApp; sin plan no se programa la continuidad." },
    );
    return lista;
  }

  lista.push(estadoOrden(d.orden_estado));
  if (!servicio || requiereHistoria(servicio)) lista.push(estadoHistoria(d.historia_estado));

  if (d.eps === "SOS" && servicio) {
    const recibida = d.autorizacion_estado === "RECIBIDA";
    if (requiereOps(servicio, d.eps, d.edad)) {
      lista.push(
        recibida
          ? { clave: "OPS", titulo: "OPS", estado: "RECIBIDO", detalle: "Recibida. Verifica que esté vigente." }
          : { clave: "OPS", titulo: "OPS", estado: "FALTA", detalle: d.edad != null && d.edad < EDAD_MAYORIA && servicio.autorizacion_sos !== "SIEMPRE" ? "Obligatoria por ser menor de edad." : "Obligatoria para este servicio." },
      );
    } else if (servicio.autorizacion_sos === "CONDICIONAL") {
      lista.push(
        recibida
          ? { clave: "OPS", titulo: "OPS", estado: "RECIBIDO", detalle: "Recibida. Verifica que esté vigente." }
          : { clave: "OPS", titulo: "OPS", estado: "VERIFICAR", detalle: "Depende del diagnóstico y de la IPS del paciente." },
      );
    }
  }
  return lista;
}

function estadoOrden(e: string): Requisito {
  const base = { clave: "ORDEN" as const, titulo: "Orden médica" };
  switch (e) {
    case "LEGIBLE":
    case "CONFIRMADA_HUMANAMENTE":
      return { ...base, estado: "RECIBIDO", detalle: e === "LEGIBLE" ? "Recibida y legible." : "Confirmada." };
    case "RECIBIDA_PENDIENTE_REVISION":
      return { ...base, estado: "VERIFICAR", detalle: "Recibida; el OCR no la pudo leer del todo. Revísala en WhatsApp." };
    case "ILEGIBLE":
      return { ...base, estado: "FALTA", detalle: "Ilegible: pide una foto nueva." };
    default:
      return { ...base, estado: "FALTA", detalle: "No ha llegado." };
  }
}

function estadoHistoria(e: string): Requisito {
  const base = { clave: "HISTORIA" as const, titulo: "Historia clínica" };
  switch (e) {
    case "COMPLETITUD_CONFIRMADA_HUMANAMENTE":
      return { ...base, estado: "RECIBIDO", detalle: "Completa." };
    case "RECIBIDA_PENDIENTE_REVISION":
      return { ...base, estado: "VERIFICAR", detalle: "Recibida. Revisa la sección de análisis y manejo." };
    case "POSIBLEMENTE_INCOMPLETA":
      return { ...base, estado: "VERIFICAR", detalle: "Parecen faltar páginas («Página X de Y»)." };
    case "ILEGIBLE":
      return { ...base, estado: "FALTA", detalle: "Ilegible: pide fotos nuevas." };
    default:
      return { ...base, estado: "FALTA", detalle: "No ha llegado." };
  }
}

/** Qué estados de documento tiene sentido editar en el panel para este tipo. */
export function documentosEditables(servicio: ServicioCita | null, eps: string | null) {
  const clase = servicio ? claseServicio(servicio) : "VALORACION";
  if (clase === "TERAPIA") return { orden: false, historia: false, plan: true, autorizacion: false, ultimaAsistencia: true };
  return {
    orden: true,
    historia: !servicio || requiereHistoria(servicio),
    plan: false,
    autorizacion: eps === "SOS" || (servicio?.autorizacion_sos ?? "NO") !== "NO" || eps === "SALUD_TOTAL",
    ultimaAsistencia: false,
  };
}
