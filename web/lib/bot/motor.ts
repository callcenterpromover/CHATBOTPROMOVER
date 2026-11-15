// Motor de la conversación del bot (documento 03). Función pura: recibe el estado y un mensaje y
// devuelve el nuevo estado, las respuestas y las acciones a aplicar. No toca la base ni la red,
// para poder probarlo completo.
//
// Reglas que no se rompen: una pregunta a la vez, nunca confirmar citas, no inventar datos y no
// recibir documentos antes de la autorización.

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
  | "EDAD"
  | "ORDEN"
  | "HISTORIA"
  | "TERAPIA_PREVIA"
  | "PLAN"
  | "PREFERENCIA"
  | "FACTORES"
  | "FINAL";

export type Datos = {
  inicio?: string; // primer mensaje: inicia el contador de espera (RB-067)
  canal?: Canal;
  documentoPorConfirmar?: string;
  paginas?: number;
};

export type Estado = { paso: Paso; datos: Datos };

export type CamposSolicitud = {
  documento?: string;
  nombre?: string;
  eps?: "SALUD_TOTAL" | "SOS" | "OTRA";
  eps_texto?: string;
  servicio_texto?: string;
  edad?: number;
  terapia_previa?: "SI" | "NO" | "NO_SABE";
  plan_estado?: "REQUERIDO_PENDIENTE";
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
  eps_texto?: string | null;
  servicio_texto?: string | null;
  edad?: number | null;
  historia_estado?: string | null;
} | null;

export type Contexto = { ahora: string; solicitud: SolicitudContexto };

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
const NO_SE = /^(no se|no sabe|no recuerdo|no estoy segur[oa]|ns)$/;

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
      return M.servicio;
    case "EDAD":
      return M.edad;
    case "ORDEN":
      return M.orden;
    case "HISTORIA":
      return M.historia;
    case "TERAPIA_PREVIA":
      return M.terapiaPrevia;
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

const PASOS_SIN_DOCUMENTOS: Paso[] = ["DOCUMENTO", "CONFIRMAR_DOCUMENTO", "NOMBRE", "EPS", "EPS_OTRA", "SERVICIO", "EDAD"];

function resumen(s: SolicitudContexto, datos: Datos): string {
  const lineas = [
    "Resumen de lo recibido:",
    `• Paciente: ${s?.nombre ?? "—"}`,
    `• Documento: ${s?.documento ?? "—"}`,
    `• EPS: ${s?.eps_texto ?? "—"}`,
    `• Servicio: ${s?.servicio_texto ?? "—"}`,
    `• Historia clínica: ${datos.paginas ? `${datos.paginas} página(s)` : "no recibida"}`,
  ];
  return lineas.join("\n");
}

// ------------------------------------------------------------------ motor

export function procesar(estado: Estado, entrada: Entrada, ctx: Contexto): Resultado {
  const respuestas: string[] = [];
  const acciones: Accion[] = [];
  let paso = estado.paso;
  let datos: Datos = { ...estado.datos };
  const hayConsentimiento = !["INICIO", "CONSENTIMIENTO"].includes(paso);

  const ir = (nuevo: Paso, extra?: string) => {
    paso = nuevo;
    if (extra) respuestas.push(extra);
    respuestas.push(pregunta(nuevo, datos));
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
    respuestas.push(M.audio, pregunta(paso, datos));
    return fin();
  }
  if (entrada.tipo === "otro") {
    respuestas.push(M.noSoportado, pregunta(paso, datos));
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
      respuestas.push(M.urgencia, pregunta(paso, datos));
      return fin();
    }
    if (/\b(asesor|asesora|persona|humano|agente|hablar con alguien|operador)\b/.test(t)) {
      if (hayConsentimiento)
        acciones.push({
          tipo: "alerta",
          codigo: "SOLICITA_PERSONA",
          detalle: "El paciente pidió hablar con una persona. Contactarlo por WhatsApp.",
        });
      respuestas.push(M.persona, pregunta(paso, datos));
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
        ir("HISTORIA", M.ordenRecibida);
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
          respuestas.push(M.documentosDespues, pregunta(paso, datos));
          return fin();
        }
        // Después de la historia: se agrega a la solicitud; el worker identifica el tipo.
        acciones.push({ tipo: "encolar", mediaId: entrada.mediaId, tipoDocumento: "DESCONOCIDO" });
        respuestas.push(M.documentoAgregado);
        if (paso !== "FINAL") respuestas.push(pregunta(paso, datos));
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
      acciones.push({ tipo: "actualizar", campos: { documento: limpio } });
      ir("NOMBRE");
      return fin();
    }

    case "CONFIRMAR_DOCUMENTO":
      if (esSi(texto) && datos.documentoPorConfirmar) {
        acciones.push({ tipo: "actualizar", campos: { documento: datos.documentoPorConfirmar } });
        delete datos.documentoPorConfirmar;
        ir("NOMBRE");
      } else if (esNo(texto)) {
        delete datos.documentoPorConfirmar;
        ir("DOCUMENTO");
      } else {
        respuestas.push(pregunta(paso, datos));
      }
      return fin();

    case "NOMBRE": {
      const nombre = texto.replace(/\s+/g, " ");
      const palabras = nombre.split(" ").filter((p) => p.length >= 2);
      if (!/^[\p{L}' .-]{5,120}$/u.test(nombre) || palabras.length < 2) {
        respuestas.push(M.nombreInvalido);
        return fin();
      }
      acciones.push({ tipo: "actualizar", campos: { nombre } });
      ir("EPS");
      return fin();
    }

    case "EPS":
      if (t === "1" || /salud ?total/.test(t)) {
        acciones.push({ tipo: "actualizar", campos: { eps: "SALUD_TOTAL", eps_texto: t === "1" ? "Salud Total" : texto } });
        ir("SERVICIO");
      } else if (t === "2" || /\bs ?o ?s\b|occidental/.test(t)) {
        acciones.push({ tipo: "actualizar", campos: { eps: "SOS", eps_texto: t === "2" ? "SOS" : texto } });
        ir("SERVICIO");
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

    case "SERVICIO":
      if (texto.length < 3 || texto.length > 120 || texto.includes("\n")) {
        respuestas.push(M.servicioInvalido);
        return fin();
      }
      acciones.push({ tipo: "actualizar", campos: { servicio_texto: texto } });
      ir("EDAD");
      return fin();

    case "EDAD": {
      const m = t.match(/^(\d{1,3})( anos?)?$/);
      const edad = m ? Number(m[1]) : NaN;
      if (!(edad >= 0 && edad <= 120)) {
        respuestas.push(M.edadInvalida);
        return fin();
      }
      acciones.push({ tipo: "actualizar", campos: { edad } });
      ir("ORDEN");
      return fin();
    }

    case "ORDEN":
      if (/no (la )?tengo|no tengo orden/.test(t)) respuestas.push(M.faltaOrden);
      else respuestas.push(M.orden);
      return fin();

    case "HISTORIA":
      if (t === "listo" || t === "ya" || t === "termine" || t === "eso es todo") {
        if (!datos.paginas) {
          respuestas.push(M.historiaSinPaginas);
          return fin();
        }
        if (ctx.solicitud?.historia_estado === "POSIBLEMENTE_INCOMPLETA") respuestas.push(M.historiaIncompleta);
        ir("TERAPIA_PREVIA");
      } else if (/no (la )?tengo/.test(t)) {
        ir("TERAPIA_PREVIA", M.faltaHistoria);
      } else {
        respuestas.push(datos.paginas ? M.paginaRecibida(datos.paginas) : M.historia);
      }
      return fin();

    case "TERAPIA_PREVIA": {
      const valor = NO_SE.test(t) ? "NO_SABE" : esSi(texto) ? "SI" : esNo(texto) ? "NO" : null;
      if (!valor) {
        respuestas.push(M.terapiaPrevia);
        return fin();
      }
      // RB-017 / RB-018: continuidad de Terapia ocupacional o Fonoaudiología exige el plan.
      const servicio = normalizar(ctx.solicitud?.servicio_texto ?? "");
      const requierePlan = valor === "SI" && /ocupacional|fonoaudiolog|lenguaje|maxilofacial/.test(servicio);
      acciones.push({
        tipo: "actualizar",
        campos: requierePlan ? { terapia_previa: valor, plan_estado: "REQUERIDO_PENDIENTE" } : { terapia_previa: valor },
      });
      if (requierePlan) ir("PLAN");
      else ir("PREFERENCIA", valor === "NO" ? M.terapiaNoIniciada : undefined);
      return fin();
    }

    case "PLAN":
      if (/no (lo )?tengo/.test(t)) ir("PREFERENCIA", M.faltaPlan);
      else respuestas.push(M.plan);
      return fin();

    case "PREFERENCIA":
      if (!esNo(texto) && !/^(ninguna|no tengo|cualquiera|indiferente)$/.test(t)) {
        acciones.push({ tipo: "actualizar", campos: { preferencia_horario: texto.slice(0, 120) } });
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
      if ((ctx.solicitud?.edad ?? 0) >= 60) factores.push("ADULTO_MAYOR");
      if (factores.length) acciones.push({ tipo: "actualizar", campos: { factores, factores_origen: "DECLARADO" } });
      paso = "FINAL";
      respuestas.push(resumen(ctx.solicitud, datos), M.recibida);
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
    acciones.push({ tipo: "actualizar", campos: { eps: "OTRA", eps_texto: nombreEps } });
    acciones.push({
      tipo: "alerta",
      codigo: "EPS_FUERA_DE_ALCANCE",
      detalle: `El paciente declaró la EPS «${nombreEps}», distinta de Salud Total y SOS. No se aplicaron reglas automáticas; decidir manualmente cómo continuar.`,
    });
    ir("SERVICIO", M.epsFueraDeAlcance);
    return fin();
  }
}
