// Motor de la conversación del bot (documento 03). Función pura: recibe el estado y un mensaje y
// devuelve el nuevo estado, las respuestas y las acciones a aplicar. No toca la base ni la red,
// para poder probarlo completo.
//
// Reglas que no se rompen: una pregunta a la vez, nunca confirmar citas, no inventar datos y no
// recibir documentos antes de la autorización.

import { franjasPara, opcionesPaciente, serviciosPara, type Catalogo, type ServicioCita } from "../horarios";
import { claseServicio, diasDesde, DIAS_MAX_INASISTENCIA, interpretarUltimaAsistencia, requiereHistoria, requiereOps } from "./flujo";
import { M } from "./mensajes";

export type Canal = "whatsapp" | "simulador";

export type Entrada =
  | { tipo: "texto"; texto: string }
  | { tipo: "media"; mediaId: string }
  | { tipo: "audio" }
  | { tipo: "otro" };

export type TipoDocumento = "ORDEN" | "HISTORIA" | "PLAN" | "AUTORIZACION" | "DESCONOCIDO";

export type Paso =
  | "INICIO"
  | "CONSENTIMIENTO"
  | "DOCUMENTO"
  | "CONFIRMAR_DOCUMENTO"
  | "NOMBRE"
  | "EPS"
  | "EPS_OTRA"
  | "SERVICIO"
  | "ESPECIALISTA"
  | "EDAD"
  | "ORDEN"
  | "HISTORIA"
  | "OPS"
  | "TERAPIA_PREVIA" // paso anterior al flujo por tipo; las conversaciones que iban ahí siguen
  | "ULTIMA_ASISTENCIA"
  | "PLAN"
  | "PREFERENCIA"
  | "FACTORES"
  | "FINAL";

export type Datos = {
  inicio?: string; // primer mensaje: inicia el contador de espera (RB-067)
  canal?: Canal;
  documentoPorConfirmar?: string;
  paginas?: number;
  opciones?: number[]; // IDs de servicio del último menú mostrado (0 = "Especialistas")
  franjas?: string[]; // franjas ofrecidas en la pregunta de preferencia
  planRecibido?: boolean; // el paciente envió el plan antes de que se lo pidiéramos
};

const OPCION_ESPECIALISTAS = 0;

export type Estado = { paso: Paso; datos: Datos };

export type CamposSolicitud = {
  documento?: string;
  nombre?: string;
  eps?: "SALUD_TOTAL" | "SOS" | "OTRA";
  eps_texto?: string;
  servicio_texto?: string;
  servicio_cita_id?: number;
  edad?: number;
  terapia_previa?: "SI" | "NO" | "NO_SABE";
  ultima_asistencia?: string;
  plan_estado?: "REQUERIDO_PENDIENTE";
  autorizacion_estado?: "NO_RECIBIDA";
  preferencia_horario?: string;
  factores?: string[];
  factores_origen?: "DECLARADO";
};

export type Accion =
  | { tipo: "crearSolicitud" }
  | { tipo: "nuevaSolicitud" }
  | { tipo: "actualizar"; campos: CamposSolicitud }
  | { tipo: "encolar"; mediaId: string; tipoDocumento: TipoDocumento }
  | { tipo: "alerta"; codigo: string; detalle: string };

export type SolicitudContexto = {
  documento?: string | null;
  nombre?: string | null;
  eps?: string | null;
  eps_texto?: string | null;
  servicio_texto?: string | null;
  servicio_cita_id?: number | null;
  edad?: number | null;
  historia_estado?: string | null;
  ultima_asistencia?: string | null;
  plan_estado?: string | null;
  autorizacion_estado?: string | null;
} | null;

/** `catalogo` viene del panel Agendas; sin él (o sin servicios) el bot pide servicio y horario en texto libre. */
export type Contexto = { ahora: string; solicitud: SolicitudContexto; catalogo?: Catalogo | null };

export type Resultado = { estado: Estado; respuestas: string[]; acciones: Accion[] };

export const ESTADO_INICIAL: Estado = { paso: "INICIO", datos: {} };

// ------------------------------------------------------------------ utilidades de texto

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[*_~¡!¿?.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SI = /^(si|s|claro|acepto|autorizo|de acuerdo|ok|okay|dale|listo si|si acepto|si autorizo|si senor|si senora)$/;
const NO = /^(no|n|no acepto|no autorizo|no gracias)$/;
const NO_SE = /^(no se|no sabe|no recuerdo|no me acuerdo|no estoy segur[oa]|ns)$/;
const NO_TENGO = /\bno (la |lo |las |los )?tengo\b|\bno tengo (orden|ops|plan|historia)\b/;

export const esSi = (t: string) => SI.test(normalizar(t));
export const esNo = (t: string) => NO.test(normalizar(t));

function pregunta(paso: Paso, datos: Datos): string {
  switch (paso) {
    case "INICIO":
      return M.bienvenida;
    case "CONSENTIMIENTO":
      return M.consentimiento;
    case "DOCUMENTO":
      return M.documento;
    case "CONFIRMAR_DOCUMENTO":
      return M.confirmarDocumento(datos.documentoPorConfirmar ?? "");
    case "NOMBRE":
      return M.nombre;
    case "EPS":
      return M.eps;
    case "EPS_OTRA":
      return M.epsOtraPregunta;
    case "SERVICIO":
    case "ESPECIALISTA":
      return M.servicio;
    case "EDAD":
      return M.edad;
    case "ORDEN":
      return M.orden;
    case "HISTORIA":
      return M.historia;
    case "OPS":
      return M.ops;
    case "TERAPIA_PREVIA":
    case "ULTIMA_ASISTENCIA":
      return M.ultimaAsistencia;
    case "PLAN":
      return M.plan;
    case "PREFERENCIA":
      return M.preferencia;
    case "FACTORES":
      return M.factores;
    case "FINAL":
      return M.yaRegistrada;
  }
}

const PASOS_SIN_DOCUMENTOS: Paso[] = ["DOCUMENTO", "CONFIRMAR_DOCUMENTO", "NOMBRE", "EPS", "EPS_OTRA", "EDAD", "SERVICIO", "ESPECIALISTA"];

/** Número de opción escrito por el paciente ("2", "2.", "opción 2"), o null. */
function numeroOpcion(t: string): number | null {
  const m = /^(?:opcion |la )?(\d{1,2})$/.exec(t.trim());
  return m ? Number(m[1]) : null;
}

function resumen(s: SolicitudContexto & { ultima_asistencia?: string | null }, datos: Datos, servicio: ServicioCita | null): string {
  const lineas = [
    "Esto es lo que registramos:",
    `• Paciente: ${s?.nombre ?? "—"}`,
    `• Documento: ${s?.documento ?? "—"}`,
    `• EPS: ${s?.eps_texto ?? "—"}`,
    `• Servicio: ${s?.servicio_texto ?? "—"}`,
  ];
  if (servicio && claseServicio(servicio) === "TERAPIA") {
    if (s?.ultima_asistencia) lineas.push(`• Última terapia: ${s.ultima_asistencia.split("-").reverse().join("/")}`);
  } else if (!servicio || requiereHistoria(servicio)) {
    lineas.push(`• Historia clínica: ${datos.paginas ? `${datos.paginas} página(s)` : "pendiente"}`);
  }
  return lineas.join("\n");
}

// ------------------------------------------------------------------ motor

export function procesar(estado: Estado, entrada: Entrada, ctx: Contexto): Resultado {
  const respuestas: string[] = [];
  const acciones: Accion[] = [];
  let paso = estado.paso;
  let datos: Datos = { ...estado.datos };
  const hayConsentimiento = !["INICIO", "CONSENTIMIENTO"].includes(paso);
  // Vista de la solicitud con los cambios de este mismo mensaje (la base aún no los tiene).
  const sol: NonNullable<SolicitudContexto> = { ...(ctx.solicitud ?? {}) };
  const act = (campos: CamposSolicitud) => {
    acciones.push({ tipo: "actualizar", campos });
    Object.assign(sol, campos);
  };
  const catalogo = ctx.catalogo ?? null;
  const menuServicios = () => (catalogo ? serviciosPara(catalogo, sol.eps) : { principales: [], especialistas: [] });
  const servicioElegido = (): ServicioCita | null =>
    catalogo?.servicios.find((s) => s.id === sol.servicio_cita_id) ?? null;

  // Pregunta del paso. Las de menú guardan en `datos` qué opciones se mostraron.
  const preguntar = (p: Paso): string => {
    if (p === "SERVICIO") {
      const { principales, especialistas } = menuServicios();
      if (!principales.length && !especialistas.length) {
        delete datos.opciones;
        return M.servicio;
      }
      datos.opciones = [...principales.map((s) => s.id), ...(especialistas.length ? [OPCION_ESPECIALISTAS] : [])];
      return M.servicioMenu([...principales.map((s) => s.nombre), ...(especialistas.length ? [M.opcionEspecialistas] : [])]);
    }
    if (p === "ESPECIALISTA") {
      const { especialistas } = menuServicios();
      datos.opciones = especialistas.map((s) => s.id);
      return M.especialistaMenu(especialistas.map((s) => s.nombre));
    }
    if (p === "PREFERENCIA") {
      const s = servicioElegido();
      const opciones = s && catalogo ? opcionesPaciente(franjasPara(catalogo, s, sol.edad), s.duracion_min) : [];
      if (!s || !opciones.length) {
        delete datos.franjas;
        return M.preferencia;
      }
      datos.franjas = opciones;
      return M.preferenciaOpciones(s.nombre, s.duracion_min, opciones);
    }
    return pregunta(p, datos);
  };

  // --- Flujo por tipo de solicitud (docs/superpowers/specs/2026-11-24-flujo-conversacion-bot.md) ---
  // Terapia: última asistencia → plan. Valoración/especialista: orden → (historia) → (OPS).
  // Sin catálogo (servicio en texto libre) se conserva el flujo anterior: orden → historia.
  const clase = () => {
    const s = servicioElegido();
    return s ? claseServicio(s) : null;
  };
  const inicioDocumentos = (): Paso => (clase() === "TERAPIA" ? "ULTIMA_ASISTENCIA" : "ORDEN");
  const despuesDeEdad = (): Paso => (sol.servicio_texto ? inicioDocumentos() : "SERVICIO");
  const despuesDeServicio = (): Paso => (sol.edad == null ? "EDAD" : inicioDocumentos());
  const despuesDeOrden = (): Paso => {
    const s = servicioElegido();
    if (!s || requiereHistoria(s)) return "HISTORIA";
    return despuesDeHistoria();
  };
  const despuesDeHistoria = (): Paso => {
    const s = servicioElegido();
    if (s && requiereOps(s, sol.eps, sol.edad)) {
      act({ autorizacion_estado: "NO_RECIBIDA" });
      return "OPS";
    }
    return "PREFERENCIA";
  };
  const despuesDeUltimaAsistencia = (): Paso => (datos.planRecibido ? "PREFERENCIA" : "PLAN");

  const elegirServicio = (s: ServicioCita): Resultado => {
    if (s.edad_minima != null && sol.edad != null && sol.edad < s.edad_minima) {
      acciones.push({
        tipo: "alerta",
        codigo: "MENOR_EDAD_ESPECIALISTA",
        detalle: `El paciente tiene ${sol.edad} años y pidió ${s.nombre}, que no atiende a menores de ${s.edad_minima} años. El bot le indicó acudir a su EPS para que lo redirijan.`,
      });
      ir("SERVICIO", M.menorEspecialista(s.edad_minima));
      return fin();
    }
    act({ servicio_cita_id: s.id, servicio_texto: s.nombre });
    delete datos.opciones;
    ir(despuesDeServicio());
    return fin();
  };

  const ir = (nuevo: Paso, extra?: string) => {
    paso = nuevo;
    if (extra) respuestas.push(extra);
    respuestas.push(preguntar(nuevo));
  };
  const fin = (): Resultado => ({ estado: { paso, datos }, respuestas, acciones });

  // --- Primer mensaje ------------------------------------------------------------------
  if (paso === "INICIO") {
    datos = { inicio: ctx.ahora };
    respuestas.push(M.bienvenida);
    if (entrada.tipo === "texto" && /urgen|emergencia/.test(normalizar(entrada.texto))) respuestas.push(M.urgencia);
    ir("CONSENTIMIENTO");
    return fin();
  }

  // --- Mensajes que valen en cualquier paso ----------------------------------------------
  if (entrada.tipo === "audio") {
    respuestas.push(M.audio, preguntar(paso));
    return fin();
  }
  if (entrada.tipo === "otro") {
    respuestas.push(M.noSoportado, preguntar(paso));
    return fin();
  }
  if (entrada.tipo === "texto") {
    const t = normalizar(entrada.texto);
    if (/urgen|emergencia/.test(t)) {
      if (hayConsentimiento)
        acciones.push({
          tipo: "alerta",
          codigo: "POSIBLE_URGENCIA",
          detalle: "El paciente mencionó una urgencia o emergencia. El bot le indicó acudir a urgencias o llamar al 123. Contactarlo según el protocolo institucional.",
        });
      respuestas.push(M.urgencia, preguntar(paso));
      return fin();
    }
    if (/\b(asesor|asesora|persona|humano|agente|hablar con alguien|operador)\b/.test(t)) {
      if (hayConsentimiento)
        acciones.push({
          tipo: "alerta",
          codigo: "SOLICITA_PERSONA",
          detalle: "El paciente pidió hablar con una persona. Contactarlo por WhatsApp.",
        });
      respuestas.push(M.persona, preguntar(paso));
      return fin();
    }
    if (hayConsentimiento && paso !== "FINAL" && /^(cancelar|ya no|no quiero continuar|desisto)$/.test(t)) {
      acciones.push({
        tipo: "alerta",
        codigo: "PACIENTE_DESISTE",
        detalle: "El paciente escribió que no desea continuar. Confirmar y cerrar la solicitud con el motivo «El paciente desistió».",
      });
      paso = "FINAL";
      respuestas.push(M.cancelada);
      return fin();
    }
  }

  // --- Documentos según el paso --------------------------------------------------------
  if (entrada.tipo === "media") {
    switch (paso) {
      case "CONSENTIMIENTO":
        respuestas.push(M.consentimientoAntesDeDocumentos);
        return fin();
      case "ORDEN":
        acciones.push({ tipo: "encolar", mediaId: entrada.mediaId, tipoDocumento: "ORDEN" });
        ir(despuesDeOrden(), M.ordenRecibida);
        return fin();
      case "OPS":
        acciones.push({ tipo: "encolar", mediaId: entrada.mediaId, tipoDocumento: "AUTORIZACION" });
        ir("PREFERENCIA", M.opsRecibida);
        return fin();
      case "ULTIMA_ASISTENCIA":
      case "TERAPIA_PREVIA":
        // Mandó el plan antes de la fecha: se guarda y se sigue esperando la fecha.
        acciones.push({ tipo: "encolar", mediaId: entrada.mediaId, tipoDocumento: "PLAN" });
        datos.planRecibido = true;
        respuestas.push(M.planRecibido, preguntar("ULTIMA_ASISTENCIA"));
        paso = "ULTIMA_ASISTENCIA";
        return fin();
      case "HISTORIA":
        acciones.push({ tipo: "encolar", mediaId: entrada.mediaId, tipoDocumento: "HISTORIA" });
        datos.paginas = (datos.paginas ?? 0) + 1;
        respuestas.push(M.paginaRecibida(datos.paginas));
        return fin();
      case "PLAN":
        acciones.push({ tipo: "encolar", mediaId: entrada.mediaId, tipoDocumento: "PLAN" });
        ir("PREFERENCIA", M.planRecibido);
        return fin();
      default:
        if (PASOS_SIN_DOCUMENTOS.includes(paso)) {
          respuestas.push(M.documentosDespues, preguntar(paso));
          return fin();
        }
        // Después de la historia: se agrega a la solicitud; el worker identifica el tipo.
        acciones.push({ tipo: "encolar", mediaId: entrada.mediaId, tipoDocumento: "DESCONOCIDO" });
        respuestas.push(M.documentoAgregado);
        if (paso !== "FINAL") respuestas.push(preguntar(paso));
        return fin();
    }
  }

  // --- Texto según el paso -------------------------------------------------------------
  const texto = entrada.texto.trim();
  const t = normalizar(texto);

  switch (paso) {
    case "CONSENTIMIENTO":
      if (esSi(texto)) {
        acciones.push({ tipo: "crearSolicitud" });
        ir("DOCUMENTO", M.consentimientoAceptado);
      } else if (esNo(texto)) {
        paso = "INICIO"; // la conversación se descarta: no se guarda nada
        datos = {};
        respuestas.push(M.consentimientoRechazado);
      } else {
        respuestas.push(M.consentimiento);
      }
      return fin();

    case "DOCUMENTO": {
      const limpio = texto.replace(/[\s.,\-]/g, "");
      if (!/^[0-9A-Za-z]{4,20}$/.test(limpio) || !/\d{4}/.test(limpio)) {
        respuestas.push(M.documentoInvalido);
        return fin();
      }
      // No se corrige en silencio: si tenía separadores o letras, se pide confirmación.
      if (limpio !== texto || /[A-Za-z]/.test(limpio)) {
        datos.documentoPorConfirmar = limpio.toUpperCase();
        ir("CONFIRMAR_DOCUMENTO");
        return fin();
      }
      act({ documento: limpio });
      ir("NOMBRE");
      return fin();
    }

    case "CONFIRMAR_DOCUMENTO":
      if (esSi(texto) && datos.documentoPorConfirmar) {
        act({ documento: datos.documentoPorConfirmar });
        delete datos.documentoPorConfirmar;
        ir("NOMBRE");
      } else if (esNo(texto)) {
        delete datos.documentoPorConfirmar;
        ir("DOCUMENTO");
      } else {
        respuestas.push(preguntar(paso));
      }
      return fin();

    case "NOMBRE": {
      const nombre = texto.replace(/\s+/g, " ");
      const palabras = nombre.split(" ").filter((p) => p.length >= 2);
      if (!/^[\p{L}' .-]{5,120}$/u.test(nombre) || palabras.length < 2) {
        respuestas.push(M.nombreInvalido);
        return fin();
      }
      act({ nombre });
      ir("EPS");
      return fin();
    }

    case "EPS":
      if (t === "1" || /salud ?total/.test(t)) {
        act({ eps: "SALUD_TOTAL", eps_texto: t === "1" ? "Salud Total" : texto });
        ir("EDAD");
      } else if (t === "2" || /\bs ?o ?s\b|occidental/.test(t)) {
        act({ eps: "SOS", eps_texto: t === "2" ? "SOS" : texto });
        ir("EDAD");
      } else if (t === "3" || t === "otra") {
        ir("EPS_OTRA");
      } else if (/^[\p{L} .&-]{3,60}$/u.test(texto)) {
        return epsOtra(texto);
      } else {
        respuestas.push(M.eps);
      }
      return fin();

    case "EPS_OTRA":
      if (!/^[\p{L}\d .&-]{2,60}$/u.test(texto)) {
        respuestas.push(M.epsOtraPregunta);
        return fin();
      }
      return epsOtra(texto);

    case "SERVICIO": {
      if (datos.opciones?.length) {
        const n = numeroOpcion(t);
        const id = n != null && n >= 1 ? datos.opciones[n - 1] : undefined;
        if (id === OPCION_ESPECIALISTAS) {
          ir("ESPECIALISTA");
          return fin();
        }
        const s = id != null ? catalogo?.servicios.find((x) => x.id === id) : undefined;
        if (!s) {
          respuestas.push(M.opcionInvalida, preguntar("SERVICIO"));
          return fin();
        }
        return elegirServicio(s);
      }
      // Sin catálogo configurado: texto libre, como antes.
      if (texto.length < 3 || texto.length > 120 || texto.includes("\n")) {
        respuestas.push(M.servicioInvalido);
        return fin();
      }
      act({ servicio_texto: texto });
      ir(despuesDeServicio());
      return fin();
    }

    case "ESPECIALISTA": {
      const n = numeroOpcion(t);
      if (n === 0 || /^(volver|atras|regresar)$/.test(t)) {
        ir("SERVICIO");
        return fin();
      }
      const id = n != null && n >= 1 ? datos.opciones?.[n - 1] : undefined;
      const s = id != null ? catalogo?.servicios.find((x) => x.id === id) : undefined;
      if (!s) {
        respuestas.push(M.opcionInvalida, preguntar("ESPECIALISTA"));
        return fin();
      }
      return elegirServicio(s);
    }

    case "EDAD": {
      const m = t.match(/^(\d{1,3})( anos?)?$/);
      const edad = m ? Number(m[1]) : NaN;
      if (!(edad >= 0 && edad <= 120)) {
        respuestas.push(M.edadInvalida);
        return fin();
      }
      act({ edad });
      ir(despuesDeEdad());
      return fin();
    }

    case "ORDEN":
      if (NO_TENGO.test(t)) {
        // Sin orden no hay valoración ni especialista: la solicitud queda pendiente y se cierra la conversación.
        acciones.push({
          tipo: "alerta",
          codigo: "SIN_ORDEN",
          detalle: "El paciente no tiene la orden médica. El bot le indicó pedirla a su EPS y enviarla por este chat.",
        });
        paso = "FINAL";
        respuestas.push(M.faltaOrden);
      } else respuestas.push(M.orden);
      return fin();

    case "HISTORIA":
      if (t === "listo" || t === "ya" || t === "termine" || t === "eso es todo") {
        if (!datos.paginas) {
          respuestas.push(M.historiaSinPaginas);
          return fin();
        }
        if (sol.historia_estado === "POSIBLEMENTE_INCOMPLETA") respuestas.push(M.historiaIncompleta);
        ir(despuesDeHistoria());
      } else if (NO_TENGO.test(t)) {
        ir(despuesDeHistoria(), M.faltaHistoria);
      } else {
        respuestas.push(datos.paginas ? M.paginaRecibida(datos.paginas) : M.historia);
      }
      return fin();

    case "OPS":
      if (NO_TENGO.test(t)) ir("PREFERENCIA", M.faltaOps);
      else respuestas.push(M.ops);
      return fin();

    case "TERAPIA_PREVIA":
    case "ULTIMA_ASISTENCIA": {
      if (paso === "TERAPIA_PREVIA" && clase() !== "TERAPIA") {
        // Conversación del flujo anterior que no es continuidad: sigue con lo que falta.
        ir("PREFERENCIA");
        return fin();
      }
      if (NO_SE.test(t)) {
        acciones.push({
          tipo: "alerta",
          codigo: "CONTINUIDAD_SIN_FECHA",
          detalle: "El paciente no recuerda la fecha de su última terapia. Verificarla antes de agendar la continuidad.",
        });
        ir(despuesDeUltimaAsistencia());
        return fin();
      }
      const fecha = interpretarUltimaAsistencia(texto, ctx.ahora);
      if (!fecha) {
        respuestas.push(M.ultimaAsistenciaInvalida);
        paso = "ULTIMA_ASISTENCIA";
        return fin();
      }
      act({ ultima_asistencia: fecha });
      const dias = diasDesde(fecha, ctx.ahora);
      if (dias > DIAS_MAX_INASISTENCIA) {
        acciones.push({
          tipo: "alerta",
          codigo: "CONTINUIDAD_VENCIDA",
          detalle: `Última asistencia hace ${dias} días (máximo ${DIAS_MAX_INASISTENCIA}). El bot le indicó ir a medicina general de su EPS para renovar órdenes y documentos.`,
        });
        paso = "FINAL";
        respuestas.push(M.continuidadVencida(dias));
        return fin();
      }
      if (!datos.planRecibido) act({ plan_estado: "REQUERIDO_PENDIENTE" });
      ir(despuesDeUltimaAsistencia());
      return fin();
    }

    case "PLAN":
      if (NO_TENGO.test(t)) ir("PREFERENCIA", M.faltaPlan);
      else respuestas.push(M.plan);
      return fin();

    case "PREFERENCIA":
      if (datos.franjas?.length) {
        const n = numeroOpcion(t);
        const cualquiera = n === datos.franjas.length + 1 || /^(cualquiera|cualquier horario|indiferente|no|ninguna)$/.test(t);
        if (!cualquiera && !(n != null && n >= 1 && n <= datos.franjas.length)) {
          respuestas.push(M.opcionInvalida, preguntar("PREFERENCIA"));
          return fin();
        }
        if (!cualquiera) act({ preferencia_horario: datos.franjas[n! - 1] });
        delete datos.franjas;
        ir("FACTORES");
        return fin();
      }
      if (!esNo(texto) && !/^(ninguna|no tengo|cualquiera|indiferente)$/.test(t)) {
        act({ preferencia_horario: texto.slice(0, 120) });
      }
      ir("FACTORES");
      return fin();

    case "FACTORES": {
      const factores: string[] = [];
      if (!/^(ninguna|ninguno|no|0|4)$/.test(t)) {
        const numeros = t.split(/[\s,y]+/).filter(Boolean);
        if (!numeros.length || numeros.some((n) => !["1", "2", "3"].includes(n))) {
          respuestas.push(M.factoresInvalidos);
          return fin();
        }
        const mapa: Record<string, string> = { "1": "FUERA_DE_CALI", "2": "MOVILIDAD_REDUCIDA", "3": "EMBARAZO" };
        for (const n of new Set(numeros)) factores.push(mapa[n]);
      }
      // Adulto mayor se deriva de la edad declarada (60 años o más, Ley 1251 de 2008).
      if ((sol.edad ?? 0) >= 60) factores.push("ADULTO_MAYOR");
      if (factores.length) act({ factores, factores_origen: "DECLARADO" });
      paso = "FINAL";
      respuestas.push(resumen(sol, datos, servicioElegido()), M.recibida);
      return fin();
    }

    case "FINAL":
      if (t === "nueva" || t === "nueva solicitud") {
        acciones.push({ tipo: "nuevaSolicitud" });
        datos = { inicio: ctx.ahora, canal: datos.canal };
        ir("CONSENTIMIENTO");
      } else {
        respuestas.push(M.yaRegistrada);
      }
      return fin();
  }

  return fin();

  function epsOtra(nombreEps: string): Resultado {
    // PROMOVER solo atiende Salud Total y SOS por este canal: no se hacen preguntas que no van a servir.
    act({ eps: "OTRA", eps_texto: nombreEps });
    acciones.push({
      tipo: "alerta",
      codigo: "EPS_FUERA_DE_ALCANCE",
      detalle: `El paciente declaró la EPS «${nombreEps}», distinta de Salud Total y SOS. El bot terminó la conversación; decidir manualmente si se contacta.`,
    });
    paso = "FINAL";
    respuestas.push(M.epsFueraDeAlcance);
    return fin();
  }
}
