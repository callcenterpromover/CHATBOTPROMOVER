// Textos del bot (documento 03; flujo por tipo: docs/superpowers/specs/2026-11-24-flujo-conversacion-bot.md).
// Los marcados como PRELIMINAR deben aprobarse por PROMOVER (área jurídica / protección de datos)
// antes de usarse con pacientes reales: no se reescriben sin esa aprobación.

export const M = {
  // --- Flujo corto (2026-11-24): un solo saludo pide todo. ---
  // PRELIMINAR: la aceptación por continuar la conversación (Ley 1581 de 2012) requiere aprobación jurídica.
  saludo:
    "Hola, te comunicas con PROMOVER Cali. 👋\n" +
    "Para registrar tu solicitud de cita, envíanos por aquí:\n" +
    "• Número de cédula del paciente\n" +
    "• Nombre completo\n" +
    "• Foto o PDF de la orden médica\n" +
    "• Historia clínica completa\n" +
    "Si ya estás en terapias, envía el plan de tratamiento en lugar de la orden y la historia.\n\n" +
    "Al continuar esta conversación aceptas el tratamiento de tus datos personales y de salud según la Ley 1581 de 2012. " +
    "Por este chat no se confirman citas: el equipo revisa tu solicitud y te contacta.",
  faltan: (lista: string) => `Todavía nos falta ${lista}. Envíalo por aquí para completar tu solicitud.`,
  leyendo: "Estamos revisando los documentos que enviaste. Si falta algo, te escribimos.",
  enRevision:
    "Recibimos tus documentos y el equipo los está revisando. Si falta algo, te escribimos.",
  enRevisionConDatos: (lista: string) =>
    `Recibimos tus documentos y el equipo los está revisando. Mientras tanto, envíanos ${lista}.`,
  recibidoTodo:
    "Recibimos tus datos y documentos. El equipo de PROMOVER los revisa y te contacta para asignar la cita. " +
    "Por este chat la cita no queda confirmada.",
  solicitudCompleta:
    "Tu solicitud está completa y el equipo la está revisando. Te contactamos para asignar la cita. " +
    "Si necesitas una solicitud distinta (otra orden), escribe *NUEVA*.",

  bienvenida:
    "Hola, te escribe el equipo de PROMOVER S.A.S. 👋\n" +
    "Por aquí recibimos las solicitudes de cita. Revisamos cada una y te contactamos para asignarla, así que la cita no queda confirmada en este chat.\n" +
    "Por favor no envíes audios ni llames a este número.",

  // PRELIMINAR: texto de autorización (Ley 1581 de 2012). Requiere aprobación jurídica.
  consentimiento:
    "Para preparar tu solicitud necesitamos tratar datos personales y de salud del paciente " +
    "(documento, nombre, EPS, orden médica e historia clínica), con apoyo de proveedores tecnológicos. " +
    "Los usamos solo para gestionar esta solicitud y los eliminamos cuando termina la gestión.\n\n" +
    "¿Autorizas este tratamiento? Responde *SÍ* o *NO*.",

  consentimientoAceptado: "Gracias. Te voy haciendo las preguntas una por una.",
  consentimientoRechazado:
    "Está bien. Sin tu autorización no podemos registrar la solicitud. Si cambias de opinión, escríbenos cuando quieras.",
  consentimientoAntesDeDocumentos:
    "Antes de recibir documentos necesitamos tu autorización para tratar los datos. Responde *SÍ* o *NO*.",

  documento: "¿Cuál es el número de documento del paciente? Escríbelo sin puntos ni comas.",
  documentoInvalido:
    "Escribe el número solo con números (o letras y números si es pasaporte), sin puntos ni comas.",
  confirmarDocumento: (doc: string) => `¿El número de documento es *${doc}*? Responde *SÍ* o *NO*.`,

  nombre: "¿Cuál es el nombre completo del paciente? Con nombres y apellidos.",
  nombreInvalido: "Necesitamos nombres y apellidos. Escríbelo de nuevo, por favor.",

  eps:
    "¿De qué EPS es el paciente? Responde con el número:\n1. Salud Total\n2. SOS (Servicio Occidental de Salud)\n3. Otra",
  epsOtraPregunta: "¿Cuál es la EPS del paciente?",
  epsFueraDeAlcance:
    "Gracias. Por este canal solo atendemos pacientes de Salud Total y SOS. Dejamos registrada tu solicitud y alguien del equipo la revisará para decirte si podemos atenderte.",

  servicio: "Escribe el servicio tal como aparece en la orden médica (por ejemplo: «Terapia física integral»).",
  servicioInvalido: "Escribe el servicio que aparece en la orden, en una sola línea.",
  servicioMenu: (opciones: string[]) =>
    "¿Qué servicio necesita el paciente? Responde con el número:\n" +
    opciones.map((o, i) => `${i + 1}. ${o}`).join("\n"),
  opcionEspecialistas: "Especialistas (fisiatría, ortopedia, equipo interdisciplinario, infiltraciones)",
  especialistaMenu: (opciones: string[]) =>
    "¿Con cuál especialista es la cita? Responde con el número:\n" +
    opciones.map((o, i) => `${i + 1}. ${o}`).join("\n") +
    "\n0. Volver al menú anterior",
  opcionInvalida: "Responde solo con el número de una de las opciones.",
  menorEspecialista: (edadMinima: number) =>
    `En PROMOVER los especialistas no atienden a menores de ${edadMinima} años, aunque tengan OPS. ` +
    "Acude a tu EPS para que te remitan a otra IPS que sí pueda atenderte.\n" +
    "Si necesitas otro servicio, elige una opción del menú.",

  edad: "¿Qué edad tiene el paciente? Escribe solo el número.",
  edadInvalida: "Escribe la edad solo con números, por ejemplo: 45.",

  orden:
    "Envíanos una foto de la *orden médica* (o el PDF). Que se vea completa, con los bordes y buena luz.\n" +
    "Si no la tienes, escribe *NO TENGO*.",
  ordenRecibida: "Recibimos la orden.",
  faltaOrden:
    "Sin la orden médica no podemos continuar. Pídela en tu EPS y, cuando la tengas, envíanos la foto por este mismo chat: queda en tu solicitud.",

  historia:
    "Ahora envía la *historia clínica completa*, una foto por página (o el PDF). Cuando termines, escribe *LISTO*.\n" +
    "Si no la tienes, escribe *NO TENGO*.",
  paginaRecibida: (n: number) =>
    `Llevamos ${n === 1 ? "1 página" : `${n} páginas`}. Si hay más, envíalas; cuando termines escribe *LISTO*.`,
  historiaSinPaginas: "Todavía no nos llega la historia clínica. Envía la foto de cada página o el PDF.",
  historiaIncompleta:
    "Parece que faltan páginas de la historia clínica (el documento dice «Página X de Y»). Si las tienes, envíalas; si no, el equipo lo revisa.",
  faltaHistoria:
    "Necesitamos la historia clínica para revisar el caso. Puedes pedirla en tu EPS y enviarla por aquí cuando la tengas; mientras tanto la solicitud queda pendiente.",

  ops:
    "Para este servicio SOS pide la *OPS* (autorización de servicios). Envía la foto o el PDF.\n" +
    "Si todavía no la tienes, escribe *NO TENGO*.",
  opsRecibida: "Recibimos la OPS.",
  faltaOps:
    "La OPS la entrega SOS. Cuando la tengas, envíala por este chat; mientras tanto la solicitud queda pendiente.",

  ultimaAsistencia:
    "¿Cuándo fue la última terapia del paciente? Escribe la fecha (por ejemplo: 15/11) o cuántos días han pasado (por ejemplo: hace 5 días).",
  ultimaAsistenciaInvalida:
    "No entendí la fecha. Escríbela así: 15/11, o cuántos días han pasado, por ejemplo: hace 5 días. Si no la recuerdas, escribe *NO RECUERDO*.",
  continuidadVencida: (dias: number) =>
    `Han pasado ${dias} días desde la última terapia. Cuando son más de 20 días sin asistir hay que renovar el proceso: ` +
    "pide una cita con medicina general en tu EPS para que te renueven la orden y los documentos. Cuando los tengas, escríbenos y empezamos de nuevo.",

  plan: "Envíanos una foto del *plan de tratamiento* que te dieron en las terapias. Si no lo tienes, escribe *NO TENGO*.",
  planRecibido: "Recibimos el plan de tratamiento.",
  faltaPlan:
    "Para continuar las terapias necesitamos el plan de tratamiento. Pídelo a tu terapeuta en PROMOVER y envíalo por aquí; mientras tanto la solicitud queda pendiente.",

  preferencia:
    "¿Tienes alguna preferencia de día u horario? La tenemos en cuenta, pero no es una reserva. Escríbela o responde *NO*.",
  preferenciaOpciones: (servicio: string, duracion: number, opciones: string[]) =>
    `*${servicio}* dura unos ${duracion} minutos y se atiende en estos horarios. ` +
    "¿Cuál te sirve más? La tenemos en cuenta, pero no es una reserva: el equipo revisa la disponibilidad y te contacta.\n" +
    opciones.map((o, i) => `${i + 1}. ${o}`).join("\n") +
    `\n${opciones.length + 1}. Cualquier horario`,

  // PRELIMINAR: el uso de estos factores como filtro requiere política aprobada (documento 07).
  factores:
    "Para organizar la atención, ¿aplica alguna de estas situaciones al paciente? Responde con los números separados por coma, o *NINGUNA*:\n" +
    "1. Vive fuera de Cali\n2. Tiene movilidad reducida\n3. Está en embarazo",
  factoresInvalidos: "Responde con los números (por ejemplo: 1, 3) o escribe *NINGUNA*.",

  recibida:
    "Listo, quedó registrada. Alguien del equipo de PROMOVER revisa los documentos y te contacta para asignar la cita o pedirte algo que falte. " +
    "Mientras tanto, la cita no está confirmada.",
  yaRegistrada:
    "Tu solicitud ya está registrada y la estamos revisando; la cita todavía no está confirmada.\n" +
    "Si te falta enviar un documento, mándalo por aquí. Para una solicitud distinta (otra orden u otro diagnóstico), escribe *NUEVA*.",
  documentoAgregado: "Recibimos el documento y lo agregamos a tu solicitud.",
  documentosDespues: "Primero necesitamos unos datos; los documentos te los pedimos en un momento.",

  audio:
    "Por favor escribe la información por este chat. Aquí no podemos atender audios ni llamadas.",
  noSoportado: "Por este canal solo recibimos texto, fotos y archivos PDF.",

  // PRELIMINAR: protocolo de urgencias pendiente de aprobación institucional (documento 08, pendiente 10).
  urgencia:
    "Este canal no atiende urgencias. Si el paciente tiene una urgencia, acude al servicio de urgencias más cercano o llama a la línea 123.",
  persona: "Listo, le avisamos al equipo que quieres hablar con una persona y te contactarán. Mientras tanto puedes seguir con la solicitud.",
  cancelada: "Entendido, no seguimos con la solicitud. Si cambias de opinión, escríbenos.",

  // Avisos después de leer un documento (los envía el sistema cuando el worker termina).
  reenvioIlegible:
    "No logramos leer bien el documento. Envía una foto nueva, con buena luz, enfocada y con todos los bordes. Si tiene varias páginas, envíalas todas.",
  reenvioNoProcesable:
    "No pudimos abrir uno de los archivos. Envíalo de nuevo como foto (JPG o PNG) o como PDF sin contraseña.",
} as const;
