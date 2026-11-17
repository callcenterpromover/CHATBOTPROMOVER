// Catálogo de servicios y franjas de atención (panel Agendas). Funciones puras: las usan el bot,
// la vista previa del panel y las pruebas. Una franja es el horario de atención; la última cita
// empieza a fin − duración.

export type EpsServicio = "TODAS" | "SALUD_TOTAL" | "SOS";
export type GrupoEdad = "TODOS" | "NINOS" | "ADULTOS";
export type Requisito = "SIEMPRE" | "MENORES" | "CONDICIONAL" | "NO";
export type AgendaSos = "FISIO_SOS" | "ESPECIALISTAS_SOS";

export type ServicioCita = {
  id: number;
  codigo: string;
  nombre: string;
  nombre_visoft: string | null;
  duracion_min: number;
  eps: EpsServicio;
  menu: "PRINCIPAL" | "ESPECIALISTAS";
  por_grupo_edad: boolean;
  edad_minima: number | null;
  agenda: AgendaSos | null;
  autorizacion_salud_total: Requisito;
  autorizacion_sos: Requisito;
  ubicacion: string | null;
  profesional: string | null;
  notas_equipo: string | null;
  orden: number;
  activo: boolean;
};

export type Franja = {
  servicio_id: number;
  grupo_edad: GrupoEdad;
  dia_semana: number; // 1 = lunes … 7 = domingo
  hora_inicio: string; // "07:00" o "07:00:00"
  hora_fin: string;
};

export type Catalogo = { servicios: ServicioCita[]; franjas: Franja[]; edadCorteNinos: number };

export const DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;
export const GRUPOS: Record<GrupoEdad, string> = { TODOS: "Todos", NINOS: "Niños", ADULTOS: "Adultos" };

// ------------------------------------------------------------------ horas

export function aMinutos(hora: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(hora);
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59 ? h * 60 + min : NaN;
}

/** 420 → "07:00" (formato de los campos de hora). */
export function aHora(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

/** 780 → { hora: "1:00", sufijo: "p. m." } */
function hora12(minutos: number) {
  const h = Math.floor(minutos / 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { hora: `${h12}:${String(minutos % 60).padStart(2, "0")}`, sufijo: h < 12 ? "a. m." : "p. m." };
}

export function horaLegible(minutos: number): string {
  const { hora, sufijo } = hora12(minutos);
  return `${hora} ${sufijo}`;
}

/** Rango de horas de inicio: "de 7:00 a 8:30 a. m.", "de 11:30 a. m. a 1:00 p. m." o "a las 11:00 a. m.". */
export function rangoLegible(inicio: number, ultimo: number): string {
  if (ultimo <= inicio) return `${hora12(inicio).hora.startsWith("1:") ? "a la" : "a las"} ${horaLegible(inicio)}`;
  const a = hora12(inicio);
  const b = hora12(ultimo);
  return a.sufijo === b.sufijo ? `de ${a.hora} a ${b.hora} ${b.sufijo}` : `de ${a.hora} ${a.sufijo} a ${b.hora} ${b.sufijo}`;
}

/** [1,2,3,5] → "lunes a miércoles y viernes" */
export function diasLegibles(dias: number[]): string {
  const orden = [...new Set(dias)].sort((a, b) => a - b);
  const tramos: string[] = [];
  for (let i = 0; i < orden.length; ) {
    let j = i;
    while (j + 1 < orden.length && orden[j + 1] === orden[j] + 1) j++;
    const a = DIAS[orden[i]].toLowerCase();
    const b = DIAS[orden[j]].toLowerCase();
    if (j === i) tramos.push(a);
    else if (j === i + 1) tramos.push(a, b);
    else tramos.push(`${a} a ${b}`);
    i = j + 1;
  }
  const texto = tramos.length > 1 ? `${tramos.slice(0, -1).join(", ")} y ${tramos.at(-1)}` : (tramos[0] ?? "");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// ------------------------------------------------------------------ validación

export type FranjaEditable = { dia: number; inicio: string; fin: string };

/** Devuelve el primer error en lenguaje claro, o null si las franjas son válidas. */
export function validarFranjas(franjas: FranjaEditable[], duracion: number): string | null {
  for (const f of franjas) {
    const i = aMinutos(f.inicio);
    const fin = aMinutos(f.fin);
    const dia = DIAS[f.dia] ?? "";
    if (!dia || Number.isNaN(i) || Number.isNaN(fin)) return "Hay una franja con día u hora inválidos.";
    if (fin <= i) return `${dia}: la hora final debe ser posterior a la inicial.`;
    if (i % 5 || fin % 5) return `${dia}: usa horas en múltiplos de 5 minutos.`;
    if (fin - i < duracion) return `${dia} ${f.inicio}–${f.fin}: no alcanza para una cita de ${duracion} minutos.`;
  }
  for (let a = 0; a < franjas.length; a++) {
    for (let b = a + 1; b < franjas.length; b++) {
      const x = franjas[a];
      const y = franjas[b];
      if (x.dia === y.dia && aMinutos(x.inicio) < aMinutos(y.fin) && aMinutos(y.inicio) < aMinutos(x.fin)) {
        return `${DIAS[x.dia]}: las franjas ${x.inicio}–${x.fin} y ${y.inicio}–${y.fin} se cruzan.`;
      }
    }
  }
  return null;
}

export type CruceSos = { dia: number; fisio: string; especialista: string; rango: string };

/** Cruces entre fisioterapia SOS y especialistas SOS (comparten el profesional de fisioterapia SOS). */
export function crucesAgendaSos(cat: Pick<Catalogo, "servicios" | "franjas">): CruceSos[] {
  const porId = new Map(cat.servicios.filter((s) => s.activo).map((s) => [s.id, s]));
  const de = (agenda: AgendaSos) => cat.franjas.filter((f) => porId.get(f.servicio_id)?.agenda === agenda);
  const cruces: CruceSos[] = [];
  for (const a of de("FISIO_SOS")) {
    for (const b of de("ESPECIALISTAS_SOS")) {
      const ini = Math.max(aMinutos(a.hora_inicio), aMinutos(b.hora_inicio));
      const fin = Math.min(aMinutos(a.hora_fin), aMinutos(b.hora_fin));
      if (a.dia_semana === b.dia_semana && ini < fin) {
        cruces.push({
          dia: a.dia_semana,
          fisio: porId.get(a.servicio_id)!.nombre,
          especialista: porId.get(b.servicio_id)!.nombre,
          rango: `${aHora(ini)}–${aHora(fin)}`,
        });
      }
    }
  }
  return cruces;
}

// ------------------------------------------------------------------ para el bot

/** Servicios activos que aplican a la EPS, en orden. EPS distinta o sin definir: solo los de todas. */
export function serviciosPara(cat: Catalogo, eps: string | null | undefined) {
  const aplica = (s: ServicioCita) =>
    s.activo && (s.eps === "TODAS" || (eps === "SALUD_TOTAL" && s.eps === "SALUD_TOTAL") || (eps === "SOS" && s.eps === "SOS"));
  const lista = cat.servicios.filter(aplica).sort((a, b) => a.orden - b.orden || a.id - b.id);
  return {
    principales: lista.filter((s) => s.menu === "PRINCIPAL"),
    especialistas: lista.filter((s) => s.menu === "ESPECIALISTAS"),
  };
}

export function grupoEdadPara(servicio: ServicioCita, edad: number | null | undefined, corte: number): GrupoEdad {
  if (!servicio.por_grupo_edad) return "TODOS";
  return edad != null && edad < corte ? "NINOS" : "ADULTOS";
}

export function franjasPara(cat: Catalogo, servicio: ServicioCita, edad: number | null | undefined): Franja[] {
  const grupo = grupoEdadPara(servicio, edad, cat.edadCorteNinos);
  return cat.franjas.filter((f) => f.servicio_id === servicio.id && f.grupo_edad === grupo);
}

/**
 * Opciones para el paciente: una por rango de horas, con los días que lo comparten.
 * Ej.: "Lunes a viernes, de 7:00 a 8:30 a. m.". Muestra la hora de inicio de la última cita.
 */
export function opcionesPaciente(franjas: Pick<Franja, "dia_semana" | "hora_inicio" | "hora_fin">[], duracion: number): string[] {
  const grupos = new Map<string, { inicio: number; ultimo: number; dias: number[] }>();
  for (const f of franjas) {
    const inicio = aMinutos(f.hora_inicio);
    const ultimo = aMinutos(f.hora_fin) - duracion;
    if (Number.isNaN(inicio) || ultimo < inicio) continue;
    const clave = `${inicio}-${ultimo}`;
    const g = grupos.get(clave) ?? { inicio, ultimo, dias: [] };
    g.dias.push(f.dia_semana);
    grupos.set(clave, g);
  }
  return [...grupos.values()]
    .sort((a, b) => Math.min(...a.dias) - Math.min(...b.dias) || a.inicio - b.inicio)
    .map((g) => `${diasLegibles(g.dias)}, ${rangoLegible(g.inicio, g.ultimo)}`);
}
