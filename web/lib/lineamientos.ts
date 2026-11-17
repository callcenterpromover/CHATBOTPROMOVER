// "A verificar al agendar": arma la lista de comprobaciones de una solicitud a partir de los datos
// editables del panel Agendas (docs/lineamientos_agendamiento_promover.md). Funciones puras.

import type { Requisito, ServicioCita } from "./horarios";

export type IpsSos = {
  id: number;
  nombre: string;
  es_primaria: boolean;
  requiere_ops: boolean;
  nota: string | null;
  orden: number;
  activo: boolean;
};

export type Lineamiento = {
  id: number;
  titulo: string;
  texto: string;
  aplica_eps: "TODAS" | "SALUD_TOTAL" | "SOS";
  solo_menores: boolean;
  orden: number;
  activo: boolean;
};

export type Verificacion = { titulo: string; texto: string; nivel: "alerta" | "aviso" | "info" };

const MAYORIA_EDAD = 18;

export const REQUISITOS: Record<Requisito, string> = {
  SIEMPRE: "Siempre",
  MENORES: "Solo menores de edad",
  CONDICIONAL: "Depende del caso",
  NO: "No requiere",
};

/** ¿Este servicio exige autorización (Salud Total) u OPS (SOS) para este paciente? */
export function requisitoAutorizacion(
  servicio: Pick<ServicioCita, "autorizacion_salud_total" | "autorizacion_sos">,
  eps: string | null | undefined,
  edad: number | null | undefined,
): "SI" | "CONDICIONAL" | "NO" {
  const regla = eps === "SALUD_TOTAL" ? servicio.autorizacion_salud_total : eps === "SOS" ? servicio.autorizacion_sos : "NO";
  if (regla === "SIEMPRE") return "SI";
  if (regla === "MENORES") return edad != null && edad < MAYORIA_EDAD ? "SI" : edad == null ? "CONDICIONAL" : "NO";
  return regla === "CONDICIONAL" ? "CONDICIONAL" : "NO";
}

const RECIBIDA = new Set(["RECIBIDA", "POSIBLEMENTE_UTILIZADA", "PENDIENTE_VERIFICACION_HUMANA"]);

export function verificaciones(p: {
  servicio: ServicioCita | null;
  eps: string | null | undefined;
  edad: number | null | undefined;
  autorizacionEstado: string | null | undefined;
  lineamientos: Lineamiento[];
  ips: IpsSos[];
}): Verificacion[] {
  const lista: Verificacion[] = [];
  const nombreDoc = p.eps === "SOS" ? "OPS" : "autorización";
  const menor = p.edad != null && p.edad < MAYORIA_EDAD;

  if (p.servicio) {
    const s = p.servicio;
    const req = requisitoAutorizacion(s, p.eps, p.edad);
    const llego = RECIBIDA.has(p.autorizacionEstado ?? "");
    if (req === "SI") {
      lista.push(
        llego
          ? { titulo: `${nombreDoc[0].toUpperCase()}${nombreDoc.slice(1)} recibida`, texto: `Se detectó un documento de ${nombreDoc}. Verificar que corresponda y esté vigente.`, nivel: "info" }
          : { titulo: `Falta ${nombreDoc}`, texto: `Este servicio exige ${nombreDoc} para atender al paciente y no se ha detectado en los documentos.`, nivel: "alerta" },
      );
    } else if (req === "CONDICIONAL") {
      lista.push({
        titulo: `${nombreDoc[0].toUpperCase()}${nombreDoc.slice(1)} según el caso`,
        texto: `${llego ? `Se detectó un documento de ${nombreDoc}. ` : `No se ha detectado ${nombreDoc}. `}${s.notas_equipo ?? "Revisar si el caso la requiere."}`,
        nivel: llego ? "info" : "aviso",
      });
    }
    if (s.edad_minima != null && p.edad != null && p.edad < s.edad_minima) {
      lista.push({
        titulo: `Menor de ${s.edad_minima} años`,
        texto: `${s.nombre} no se atiende a menores de ${s.edad_minima} años, aunque tengan ${nombreDoc}. El paciente debe acudir a su EPS para que lo redirijan.`,
        nivel: "alerta",
      });
    }
    const agenda = [
      s.nombre_visoft && `Agendar en Visoft como «${s.nombre_visoft}».`,
      s.ubicacion && `Lugar: ${s.ubicacion}.`,
      s.profesional && `Profesional: ${s.profesional}.`,
      s.por_grupo_edad && `Grupo de edad: ${menor ? "niños" : "adultos"} (agendar niños con niños y adultos con adultos).`,
    ].filter(Boolean);
    if (agenda.length) lista.push({ titulo: "Datos de agendamiento", texto: agenda.join(" "), nivel: "info" });
    if (s.notas_equipo && req !== "CONDICIONAL") lista.push({ titulo: "Nota del servicio", texto: s.notas_equipo, nivel: "info" });
  }

  if (p.eps === "SOS") {
    const activas = p.ips.filter((i) => i.activo).sort((a, b) => a.orden - b.orden);
    const primarias = activas.filter((i) => i.es_primaria).map((i) => i.nombre);
    const especiales = activas.filter((i) => !i.es_primaria).map((i) => `${i.nombre}: ${i.nota ?? (i.requiere_ops ? "requiere OPS." : "")}`);
    const partes = [primarias.length && `IPS primarias: ${primarias.join(", ")}.`, ...especiales].filter(Boolean);
    if (partes.length) lista.push({ titulo: "Verificar la IPS del paciente", texto: partes.join(" · "), nivel: "aviso" });
  }

  for (const l of p.lineamientos.filter((x) => x.activo).sort((a, b) => a.orden - b.orden)) {
    if (l.aplica_eps !== "TODAS" && l.aplica_eps !== p.eps) continue;
    if (l.solo_menores && !menor) continue;
    lista.push({ titulo: l.titulo, texto: l.texto, nivel: "aviso" });
  }
  return lista;
}
