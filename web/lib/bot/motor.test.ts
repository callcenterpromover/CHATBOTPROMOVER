import { describe, expect, it } from "vitest";
import { M } from "./mensajes";
import type { Catalogo } from "../horarios";
import { CATALOGO_PRUEBA } from "../horarios.prueba";
import { ESTADO_INICIAL, procesar, type Accion, type Contexto, type Entrada, type Estado } from "./motor";

const AHORA = "2026-11-15T10:00:00.000Z";
const texto = (t: string): Entrada => ({ tipo: "texto", texto: t });
const media = (id: string): Entrada => ({ tipo: "media", mediaId: id });
const ctx = (solicitud: Contexto["solicitud"] = null): Contexto => ({ ahora: AHORA, solicitud });

/** Ejecuta una conversación completa y acumula acciones y respuestas. */
// El flujo paso a paso (consentimiento, documento, nombre…) sigue vivo para las conversaciones que ya iban
// por la mitad cuando llegó el flujo corto: estas pruebas arrancan en ese punto.
const EN_CONSENTIMIENTO: Estado = { paso: "CONSENTIMIENTO", datos: { inicio: AHORA } };

function conversar(entradas: Entrada[], solicitud: Contexto["solicitud"] = null, catalogo: Catalogo | null = null) {
  let estado: Estado = EN_CONSENTIMIENTO;
  const acciones: Accion[] = [];
  const respuestas: string[] = [];
  let sol = solicitud;
  for (const e of entradas) {
    const r = procesar(estado, e, { ...ctx(sol), catalogo });
    // Como en la base: lo guardado en un mensaje se ve en el siguiente.
    sol = { ...(sol ?? {}), ...campos(r.acciones) };
    estado = r.estado;
    acciones.push(...r.acciones);
    respuestas.push(...r.respuestas);
  }
  return { estado, acciones, respuestas };
}

const campos = (acciones: Accion[]) =>
  Object.assign({}, ...acciones.filter((a) => a.tipo === "actualizar").map((a) => (a as { campos: object }).campos));

describe("flujo completo", () => {
  it("recorre todos los pasos y registra la solicitud sin confirmar cita", () => {
    const { estado, acciones, respuestas } = conversar(
      [
        texto("Hola, quiero una cita"),
        texto("Sí"),
        texto("1000000020"),
        texto("Laura Prueba Veinte"),
        texto("1"),
        texto("44"),
        texto("Terapia física integral"),
        media("m-orden"),
        media("m-hist-1"),
        media("m-hist-2"),
        texto("LISTO"),
        texto("En las mañanas"),
        texto("2"),
      ],
    );
    expect(estado.paso).toBe("FINAL");
    expect(estado.datos.inicio).toBe(AHORA);
    expect(acciones[0]).toEqual({ tipo: "crearSolicitud" });
    expect(campos(acciones)).toEqual({
      documento: "1000000020",
      nombre: "Laura Prueba Veinte",
      eps: "SALUD_TOTAL",
      eps_texto: "Salud Total",
      servicio_texto: "Terapia física integral",
      edad: 44,
      preferencia_horario: "En las mañanas",
      factores: ["MOVILIDAD_REDUCIDA"],
      factores_origen: "DECLARADO",
    });
    const encolados = acciones.filter((a) => a.tipo === "encolar");
    expect(encolados).toEqual([
      { tipo: "encolar", mediaId: "m-orden", tipoDocumento: "ORDEN" },
      { tipo: "encolar", mediaId: "m-hist-1", tipoDocumento: "HISTORIA" },
      { tipo: "encolar", mediaId: "m-hist-2", tipoDocumento: "HISTORIA" },
    ]);
    expect(respuestas.at(-1)).toBe(M.recibida);
    expect(respuestas.join(" ")).not.toMatch(/cita (confirmada|agendada|asignada)|tu cita es/i);
  });
});

describe("autorización de datos", () => {
  it("el primer mensaje es un saludo único que pide todo y avisa el tratamiento de datos", () => {
    const r = procesar(ESTADO_INICIAL, texto("hola"), ctx());
    expect(r.respuestas).toEqual([M.saludo]);
    expect(M.saludo).toContain("PROMOVER Cali");
    expect(M.saludo).toContain("Ley 1581");
    expect(r.estado.paso).toBe("RECOLECTANDO");
    expect(r.acciones).toEqual([]);
  });

  it("si no autoriza, no se crea nada y la conversación se descarta", () => {
    const { estado, acciones } = conversar([texto("hola"), texto("No")]);
    expect(estado).toEqual({ paso: "INICIO", datos: {} });
    expect(acciones).toEqual([]);
  });

  it("no recibe documentos antes de la autorización", () => {
    const { acciones, respuestas } = conversar([texto("hola"), media("m1")]);
    expect(acciones).toEqual([]);
    expect(respuestas.at(-1)).toBe(M.consentimientoAntesDeDocumentos);
  });

  it("una respuesta ambigua repite la pregunta", () => {
    const { estado, respuestas } = conversar([texto("hola"), texto("tal vez")]);
    expect(estado.paso).toBe("CONSENTIMIENTO");
    expect(respuestas.at(-1)).toBe(M.consentimiento);
  });
});

describe("validación de datos", () => {
  const hastaDocumento = [texto("hola"), texto("si")];

  it("documento con puntos: pide confirmación, no corrige en silencio", () => {
    const { estado, acciones } = conversar([...hastaDocumento, texto("1.000.000.020")]);
    expect(estado.paso).toBe("CONFIRMAR_DOCUMENTO");
    expect(estado.datos.documentoPorConfirmar).toBe("1000000020");
    expect(campos(acciones).documento).toBeUndefined();
    const r = conversar([...hastaDocumento, texto("1.000.000.020"), texto("sí")]);
    expect(campos(r.acciones).documento).toBe("1000000020");
    expect(r.estado.paso).toBe("NOMBRE");
  });

  it("documento inválido se vuelve a pedir", () => {
    const { estado, respuestas } = conversar([...hastaDocumento, texto("mi cédula")]);
    expect(estado.paso).toBe("DOCUMENTO");
    expect(respuestas.at(-1)).toBe(M.documentoInvalido);
  });

  it("nombre de una sola palabra se rechaza", () => {
    const { estado } = conversar([...hastaDocumento, texto("1000000020"), texto("Laura")]);
    expect(estado.paso).toBe("NOMBRE");
  });

  it("EPS distinta: termina la conversación con alerta para revisión manual", () => {
    const { estado, acciones, respuestas } = conversar([
      ...hastaDocumento, texto("1000000020"), texto("Laura Prueba"), texto("3"), texto("Nueva EPS"),
    ]);
    expect(estado.paso).toBe("FINAL");
    expect(campos(acciones)).toMatchObject({ eps: "OTRA", eps_texto: "Nueva EPS" });
    expect(acciones.some((a) => a.tipo === "alerta" && a.codigo === "EPS_FUERA_DE_ALCANCE")).toBe(true);
    expect(respuestas).toContain(M.epsFueraDeAlcance);
  });

  it("reconoce SOS escrito", () => {
    const { acciones } = conversar([...hastaDocumento, texto("1000000020"), texto("Laura Prueba"), texto("S.O.S")]);
    expect(campos(acciones).eps).toBe("SOS");
  });

  it("edad inválida se vuelve a pedir", () => {
    const pasos = [...hastaDocumento, texto("1000000020"), texto("Laura Prueba"), texto("1"), texto("cuarenta")];
    expect(conversar(pasos).estado.paso).toBe("EDAD");
  });

  it("no acepta documentos mientras pide datos", () => {
    const { acciones, respuestas } = conversar([...hastaDocumento, media("m1")]);
    expect(acciones.filter((a) => a.tipo === "encolar")).toEqual([]);
    expect(respuestas).toContain(M.documentosDespues);
  });
});

describe("documentos", () => {
  const hastaOrden = [
    texto("hola"), texto("si"), texto("1000000020"), texto("Laura Prueba"), texto("1"), texto("8"), texto("Terapia ocupacional"),
  ];

  it("LISTO sin páginas no avanza", () => {
    const { estado, respuestas } = conversar([...hastaOrden, media("o"), texto("listo")]);
    expect(estado.paso).toBe("HISTORIA");
    expect(respuestas.at(-1)).toBe(M.historiaSinPaginas);
  });

  it("avisa si la historia ya se detectó incompleta", () => {
    const { respuestas } = conversar([...hastaOrden, media("o"), media("h1"), texto("listo")], {
      historia_estado: "POSIBLEMENTE_INCOMPLETA",
    });
    expect(respuestas).toContain(M.historiaIncompleta);
  });

  it("sin historia: lo indica y sigue, la solicitud queda pendiente", () => {
    const { estado, respuestas } = conversar([...hastaOrden, media("o"), texto("no la tengo")]);
    expect(estado.paso).toBe("PREFERENCIA");
    expect(respuestas).toContain(M.faltaHistoria);
  });

  it("sin orden: termina con alerta y le indica pedirla a su EPS", () => {
    const { estado, acciones, respuestas } = conversar([...hastaOrden, texto("no la tengo")]);
    expect(estado.paso).toBe("FINAL");
    expect(respuestas.at(-1)).toBe(M.faltaOrden);
    expect(acciones.some((a) => a.tipo === "alerta" && a.codigo === "SIN_ORDEN")).toBe(true);
  });

  it("documentos después del registro se agregan sin tipo", () => {
    const final: Estado = { paso: "FINAL", datos: {} };
    const r = procesar(final, media("extra"), ctx());
    expect(r.acciones).toEqual([{ tipo: "encolar", mediaId: "extra", tipoDocumento: "DESCONOCIDO" }]);
    expect(r.respuestas).toEqual([M.documentoAgregado]);
  });
});

describe("mensajes especiales", () => {
  const enDocumento: Estado = { paso: "DOCUMENTO", datos: {} };

  it("audio: pide escribir y repite la pregunta", () => {
    const r = procesar(enDocumento, { tipo: "audio" }, ctx());
    expect(r.respuestas).toEqual([M.audio, M.documento]);
    expect(r.estado.paso).toBe("DOCUMENTO");
  });

  it("urgencia: indica urgencias/123 y crea alerta", () => {
    const r = procesar(enDocumento, texto("es una urgencia, me duele mucho"), ctx());
    expect(r.respuestas[0]).toBe(M.urgencia);
    expect(r.acciones).toEqual([expect.objectContaining({ tipo: "alerta", codigo: "POSIBLE_URGENCIA" })]);
  });

  it("urgencia antes de autorizar: responde pero no registra", () => {
    const r = procesar({ paso: "CONSENTIMIENTO", datos: {} }, texto("urgente"), ctx());
    expect(r.respuestas[0]).toBe(M.urgencia);
    expect(r.acciones).toEqual([]);
  });

  it("pedir una persona crea alerta", () => {
    const r = procesar(enDocumento, texto("quiero hablar con un asesor"), ctx());
    expect(r.acciones).toEqual([expect.objectContaining({ codigo: "SOLICITA_PERSONA" })]);
  });

  it("cancelar deja alerta para que una persona cierre", () => {
    const r = procesar(enDocumento, texto("cancelar"), ctx());
    expect(r.estado.paso).toBe("FINAL");
    expect(r.acciones).toEqual([expect.objectContaining({ codigo: "PACIENTE_DESISTE" })]);
  });

  it("NUEVA después del registro abre otra solicitud con el saludo único", () => {
    const r = procesar({ paso: "FINAL", datos: { canal: "simulador" } }, texto("Nueva"), ctx());
    expect(r.acciones).toEqual([{ tipo: "nuevaSolicitud" }]);
    expect(r.estado).toEqual({ paso: "RECOLECTANDO", datos: { inicio: AHORA, canal: "simulador" } });
    expect(r.respuestas).toEqual([M.saludo]);
  });

  it("adulto mayor se agrega por la edad declarada", () => {
    const r = procesar({ paso: "FACTORES", datos: {} }, texto("ninguna"), ctx({ edad: 72 }));
    expect(r.acciones).toEqual([
      { tipo: "actualizar", campos: { factores: ["ADULTO_MAYOR"], factores_origen: "DECLARADO" } },
    ]);
  });

  it("factores inválidos se vuelven a pedir", () => {
    const r = procesar({ paso: "FACTORES", datos: {} }, texto("5"), ctx());
    expect(r.estado.paso).toBe("FACTORES");
    expect(r.respuestas).toEqual([M.factoresInvalidos]);
  });
});

describe("servicios y horarios del panel Agendas", () => {
  const hastaEps = [texto("hola"), texto("si"), texto("1000000020"), texto("Laura Prueba")];
  const conCatalogo = (entradas: Entrada[]) => conversar(entradas, null, CATALOGO_PRUEBA);

  it("Salud Total: menú numerado, franjas del servicio y preferencia elegida", () => {
    const r = conCatalogo([...hastaEps, texto("1"), texto("44"), texto("1")]);
    expect(r.estado.paso).toBe("ORDEN");
    expect(campos(r.acciones)).toMatchObject({ servicio_cita_id: 1, servicio_texto: "Valoración de fisioterapia" });
    expect(r.respuestas.join("\n")).toContain("1. Valoración de fisioterapia\n2. Terapia física");
    expect(r.respuestas.join("\n")).not.toContain("Especialistas");

    const fin = conCatalogo([...hastaEps, texto("1"), texto("44"), texto("1"), media("o"), media("h"), texto("listo")]);
    expect(fin.estado.paso).toBe("PREFERENCIA");
    expect(fin.respuestas.at(-1)).toContain("1. Lunes a viernes, de 7:00 a. m. a 12:00 p. m.");
    expect(fin.respuestas.at(-1)).toContain("3. Cualquier horario");
    const elegida = conCatalogo([...hastaEps, texto("1"), texto("44"), texto("1"), media("o"), media("h"), texto("listo"), texto("2")]);
    expect(elegida.estado.paso).toBe("FACTORES");
    expect(campos(elegida.acciones).preferencia_horario).toBe("Lunes a viernes, de 1:15 a 4:45 p. m.");
  });

  it("opción fuera del menú se vuelve a pedir", () => {
    const r = conCatalogo([...hastaEps, texto("1"), texto("44"), texto("99")]);
    expect(r.estado.paso).toBe("SERVICIO");
    expect(r.respuestas).toContain(M.opcionInvalida);
  });

  it("SOS: valoración OPS sin martes", () => {
    const r = conCatalogo([...hastaEps, texto("2"), texto("40"), texto("1"), media("o"), media("h"), texto("listo")]);
    expect(campos(r.acciones).servicio_texto).toBe("Valoración de fisioterapia (OPS de terapia física integral)");
    expect(r.estado.paso).toBe("PREFERENCIA"); // la valoración SOS no exige OPS
    expect(r.respuestas.at(-1)).not.toMatch(/martes/i);
  });

  it("SOS: especialistas en un submenú y se puede volver", () => {
    const menu = conCatalogo([...hastaEps, texto("2"), texto("40")]);
    const opciones = menu.respuestas.at(-1)!;
    const n = opciones.split("\n").find((l) => l.includes("Especialistas"))!.split(".")[0];
    const r = conCatalogo([...hastaEps, texto("2"), texto("40"), texto(n), texto("1")]);
    expect(r.estado.paso).toBe("ORDEN");
    expect(campos(r.acciones)).toMatchObject({ servicio_cita_id: 5, servicio_texto: "Fisiatría" });
    const volver = conCatalogo([...hastaEps, texto("2"), texto("40"), texto(n), texto("0")]);
    expect(volver.estado.paso).toBe("SERVICIO");
  });

  it("SOS: menor de 16 no recibe cita con especialista y se le indica ir a su EPS", () => {
    const menu = conCatalogo([...hastaEps, texto("2"), texto("15")]);
    const n = menu.respuestas.at(-1)!.split("\n").find((l) => l.includes("Especialistas"))!.split(".")[0];
    const r = conCatalogo([...hastaEps, texto("2"), texto("15"), texto(n), texto("2")]);
    expect(r.estado.paso).toBe("SERVICIO");
    expect(r.respuestas).toContain(M.menorEspecialista(16));
    expect(r.acciones.some((a) => a.tipo === "alerta" && a.codigo === "MENOR_EDAD_ESPECIALISTA")).toBe(true);
    expect(campos(r.acciones).servicio_cita_id).toBeUndefined();
  });

  it("fonoaudiología: niños y adultos ven franjas distintas", () => {
    const fono = (edad: string) =>
      conCatalogo([...hastaEps, texto("1"), texto(edad), texto("3"), media("o")]).respuestas.at(-1)!;
    expect(fono("8")).toContain("Lunes a viernes, de 7:00 a 8:30 a. m.");
    expect(fono("30")).toContain("Lunes y miércoles, de 1:15 a 1:30 p. m.");
    expect(fono("30")).not.toContain("7:00");
  });

  it("terapia respiratoria muestra los turnos de las 11", () => {
    const r = conCatalogo([...hastaEps, texto("1"), texto("50"), texto("5"), texto("hace 3 dias"), media("p")]);
    expect(campos(r.acciones).servicio_texto).toBe("Terapia respiratoria");
    expect(r.respuestas.at(-1)).toContain("de 11:00 a 11:40 a. m.");
  });

  it("servicio sin franjas: la preferencia queda en texto libre", () => {
    const r = conCatalogo([...hastaEps, texto("1"), texto("50"), texto("6"), media("o"), texto("los lunes")]);
    expect(campos(r.acciones).preferencia_horario).toBe("los lunes");
    expect(r.respuestas).toContain(M.preferencia);
  });

  it("SOS fonoaudiología: después de la orden pide la OPS", () => {
    const r = conCatalogo([...hastaEps, texto("2"), texto("30"), texto("2"), media("o")]);
    expect(campos(r.acciones)).toMatchObject({ servicio_texto: "Valoración de fonoaudiología", autorizacion_estado: "NO_RECIBIDA" });
    expect(r.estado.paso).toBe("OPS");
    const conOps = conCatalogo([...hastaEps, texto("2"), texto("30"), texto("2"), media("o"), media("ops")]);
    expect(conOps.acciones.at(-1)).toEqual({ tipo: "encolar", mediaId: "ops", tipoDocumento: "AUTORIZACION" });
    expect(conOps.estado.paso).toBe("PREFERENCIA");
    const sinOps = conCatalogo([...hastaEps, texto("2"), texto("30"), texto("2"), media("o"), texto("no la tengo")]);
    expect(sinOps.respuestas).toContain(M.faltaOps);
    expect(sinOps.estado.paso).toBe("PREFERENCIA");
  });

  it("Salud Total fonoaudiología: el direccionamiento es la orden, no pide OPS ni historia", () => {
    const r = conCatalogo([...hastaEps, texto("1"), texto("30"), texto("3"), media("o")]);
    expect(r.estado.paso).toBe("PREFERENCIA");
  });

  it("SOS especialista: orden e historia; OPS solo si es menor de edad", () => {
    const n = (edad: string) =>
      conCatalogo([...hastaEps, texto("2"), texto(edad)]).respuestas.at(-1)!.split("\n").find((l) => l.includes("Especialistas"))!.split(".")[0];
    const adulto = conCatalogo([...hastaEps, texto("2"), texto("40"), texto(n("40")), texto("1"), media("o"), media("h"), texto("listo")]);
    expect(adulto.estado.paso).toBe("PREFERENCIA");
    const menor = conCatalogo([...hastaEps, texto("2"), texto("17"), texto(n("17")), texto("1"), media("o"), media("h"), texto("listo")]);
    expect(menor.estado.paso).toBe("OPS");
  });

  it("terapia (continuidad): solo última asistencia y plan", () => {
    const r = conCatalogo([...hastaEps, texto("1"), texto("44"), texto("2"), texto("10/11")]);
    expect(r.estado.paso).toBe("PLAN");
    expect(campos(r.acciones)).toMatchObject({ ultima_asistencia: "2026-11-10", plan_estado: "REQUERIDO_PENDIENTE" });
    const conPlan = conCatalogo([...hastaEps, texto("1"), texto("44"), texto("2"), texto("10/11"), media("p")]);
    expect(conPlan.acciones.filter((a) => a.tipo === "encolar")).toEqual([{ tipo: "encolar", mediaId: "p", tipoDocumento: "PLAN" }]);
    expect(conPlan.estado.paso).toBe("PREFERENCIA");
  });

  it("terapia con más de 20 días sin asistir: renovar con medicina general y termina", () => {
    const r = conCatalogo([...hastaEps, texto("2"), texto("44"), texto("4"), texto("hace 3 semanas")]);
    expect(r.estado.paso).toBe("FINAL");
    expect(r.respuestas.at(-1)).toBe(M.continuidadVencida(21));
    expect(r.acciones.some((a) => a.tipo === "alerta" && a.codigo === "CONTINUIDAD_VENCIDA")).toBe(true);
    expect(r.acciones.some((a) => a.tipo === "encolar")).toBe(false);
  });

  it("terapia: si manda el plan antes de la fecha no se lo vuelve a pedir", () => {
    const r = conCatalogo([...hastaEps, texto("1"), texto("44"), texto("2"), media("p"), texto("ayer")]);
    expect(r.estado.paso).toBe("PREFERENCIA");
    expect(campos(r.acciones).plan_estado).toBeUndefined();
  });

  it("fecha que no se entiende se vuelve a pedir", () => {
    const r = conCatalogo([...hastaEps, texto("1"), texto("44"), texto("2"), texto("la otra semana")]);
    expect(r.estado.paso).toBe("ULTIMA_ASISTENCIA");
    expect(r.respuestas.at(-1)).toBe(M.ultimaAsistenciaInvalida);
  });
});

describe("flujo corto: un saludo y el paciente envía todo", () => {
  const recolectando = (minutos = 0, extra: Partial<Estado["datos"]> = {}): Estado => ({
    paso: "RECOLECTANDO",
    datos: { inicio: new Date(new Date(AHORA).getTime() - minutos * 60_000).toISOString(), ...extra },
  });

  it("el primer mensaje después del saludo crea la solicitud; datos y documentos se recogen en silencio", () => {
    const r = procesar(recolectando(), texto("Mi cédula es 1.000.000.020 y me llamo Laura Prueba Veinte"), ctx());
    expect(r.acciones).toEqual([
      { tipo: "crearSolicitud" },
      { tipo: "actualizar", campos: { documento: "1000000020", nombre: "Laura Prueba Veinte" } },
    ]);
    expect(r.respuestas).toEqual([]);
    const doc = procesar({ ...r.estado }, media("m1"), ctx({ documento: "1000000020", nombre: "Laura Prueba Veinte" }));
    expect(doc.acciones).toEqual([{ tipo: "encolar", mediaId: "m1", tipoDocumento: "DESCONOCIDO" }]);
    expect(doc.respuestas).toEqual([]);
  });

  it("antes de media hora no responde aunque falte algo", () => {
    const r = procesar(recolectando(10, { solicitudCreada: true }), texto("hola?"), ctx());
    expect(r.respuestas).toEqual([]);
  });

  it("después de media hora le dice qué falta, una vez cada media hora", () => {
    const docs = [{ tipo_documento: "ORDEN", estado: "COMPLETADO" }];
    const r = procesar(recolectando(40, { solicitudCreada: true }), texto("hola?"), { ...ctx({ documento: "1000000020" }), documentos: docs });
    expect(r.respuestas).toEqual([M.faltan("el nombre completo y la historia clínica")]);
    const otra = procesar(r.estado, texto("??"), { ...ctx({ documento: "1000000020" }), documentos: docs });
    expect(otra.respuestas).toEqual([]);
  });

  it("si todo llegó, lo confirma y termina", () => {
    const docs = [{ tipo_documento: "ORDEN", estado: "COMPLETADO" }, { tipo_documento: "HISTORIA", estado: "COMPLETADO" }];
    const r = procesar(recolectando(5, { solicitudCreada: true }), texto("listo"), { ...ctx({ documento: "1", nombre: "Ana Prueba" }), documentos: docs });
    expect(r.estado.paso).toBe("FINAL");
    expect(r.respuestas).toEqual([M.recibidoTodo]);
  });

  it("continuidad: el plan de tratamiento basta", () => {
    const docs = [{ tipo_documento: "PLAN", estado: "COMPLETADO" }];
    const r = procesar(recolectando(5, { solicitudCreada: true }), texto("ya"), { ...ctx({ documento: "1", nombre: "Ana Prueba" }), documentos: docs });
    expect(r.respuestas).toEqual([M.recibidoTodo]);
  });

  it("si un documento no se pudo identificar, no inventa lo que falta: lo revisa el equipo", () => {
    const docs = [{ tipo_documento: "DESCONOCIDO", estado: "COMPLETADO" }];
    const r = procesar(recolectando(45, { solicitudCreada: true }), texto("hola"), { ...ctx({ documento: "1", nombre: "Ana Prueba" }), documentos: docs });
    expect(r.respuestas).toEqual([M.enRevision]);
  });

  const hace = (min: number) => new Date(new Date(AHORA).getTime() - min * 60_000).toISOString();

  it("mientras el paciente sigue enviando cosas no lo interrumpe, aunque haya pasado media hora", () => {
    const r = procesar(recolectando(50, { solicitudCreada: true, ultimaEntrada: hace(2) }), texto("aquí va otra foto"), ctx());
    expect(r.respuestas).toEqual([]);
  });

  it("si deja de escribir media hora y vuelve, le dice lo que falta", () => {
    const r = procesar(recolectando(90, { solicitudCreada: true, ultimaEntrada: hace(45) }), texto("buenas"), ctx({ documento: "1" }));
    expect(r.respuestas).toEqual([M.faltan("el nombre completo, la orden médica y la historia clínica (o, si ya estás en terapias, solo el plan de tratamiento)")]);
  });

  it("si pregunta por su proceso pasada la media hora del saludo, responde aunque haya escrito hace poco", () => {
    const r = procesar(recolectando(40, { solicitudCreada: true, ultimaEntrada: hace(1) }), texto("¿qué me falta?"), ctx({ documento: "1", nombre: "Ana Prueba" }));
    expect(r.respuestas).toEqual([M.faltan("la orden médica y la historia clínica (o, si ya estás en terapias, solo el plan de tratamiento)")]);
  });

  it("terminada la solicitud, no responde a un «gracias» ni a documentos extra; si vuelve después, le da el estado", () => {
    const final = (extra: Partial<Estado["datos"]>): Estado => ({ paso: "FINAL", datos: { inicio: hace(120), solicitudCreada: true, completa: true, ...extra } });
    expect(procesar(final({ recordado: hace(1), ultimaEntrada: hace(1) }), texto("gracias"), ctx()).respuestas).toEqual([]);
    const doc = procesar(final({ recordado: hace(1), ultimaEntrada: hace(1) }), media("m9"), ctx());
    expect(doc.respuestas).toEqual([]);
    expect(doc.acciones).toEqual([{ tipo: "encolar", mediaId: "m9", tipoDocumento: "DESCONOCIDO" }]);
    expect(procesar(final({ recordado: hace(60), ultimaEntrada: hace(60) }), texto("hola, cómo va mi cita"), ctx()).respuestas).toEqual([M.solicitudCompleta]);
  });

  it("urgencias y cancelar siguen funcionando", () => {
    expect(procesar(recolectando(1, { solicitudCreada: true }), texto("es urgente"), ctx()).respuestas).toEqual([M.urgencia]);
    const c = procesar(recolectando(1, { solicitudCreada: true }), texto("cancelar"), ctx());
    expect(c.estado.paso).toBe("FINAL");
  });
});
