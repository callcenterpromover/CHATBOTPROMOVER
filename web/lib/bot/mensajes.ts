// Textos del bot (documento 03). Los marcados como PRELIMINAR deben aprobarse por PROMOVER
// (área jurídica / protección de datos) antes de usarse con pacientes reales.

export const M = {
  bienvenida:
    "Hola, te damos la bienvenida a PROMOVER S.A.S. 👋\n" +
    "Por este canal recibimos solicitudes de cita. Las citas no se confirman automáticamente: " +
    "nuestro equipo revisa cada solicitud y se comunica contigo.\n" +
    "Por favor no envíes audios ni hagas llamadas por este medio.",

  // PRELIMINAR: texto de autorización (Ley 1581 de 2012). Requiere aprobación jurídica.
  consentimiento:
    "Para preparar tu solicitud necesitamos tratar datos personales y de salud del paciente " +
    "(documento, nombre, EPS, orden médica e historia clínica), con apoyo de proveedores tecnológicos. " +
    "Los usamos solo para gestionar esta solicitud y los eliminamos cuando termina la gestión.\n\n" +
    "¿Autorizas este tratamiento? Responde *SÍ* o *NO*.",

  consentimientoAceptado: "Gracias. Vamos a registrar la solicitud paso a paso.",
  consentimientoRechazado:
    "Entendido. Sin tu autorización no podemos registrar la solicitud. Si cambias de opinión, escríbenos de nuevo.",
  consentimientoAntesDeDocumentos:
    "Antes de recibir documentos necesitamos tu autorización para tratar los datos. Responde *SÍ* o *NO*.",

  documento: "Escribe el número de documento del paciente, sin puntos ni comas.",
  documentoInvalido:
    "El número de documento debe tener solo números (o letras y números si es pasaporte), sin puntos ni comas. Escríbelo de nuevo.",
  confirmarDocumento: (doc: string) => `¿El número de documento es *${doc}*? Responde *SÍ* o *NO*.`,

  nombre: "Escribe el nombre completo del paciente (nombres y apellidos).",
  nombreInvalido: "Necesitamos el nombre completo, con nombres y apellidos. Escríbelo de nuevo.",

  eps:
    "¿Cuál es la EPS del paciente? Responde con el número:\n1. Salud Total\n2. SOS (Servicio Occidental de Salud)\n3. Otra",
  epsOtraPregunta: "¿Cuál es la EPS del paciente?",
  epsFueraDeAlcance:
    "Gracias. Por ahora este canal está configurado para Salud Total y SOS, así que tu solicitud quedará registrada para revisión manual de nuestro equipo.",

  servicio: "Escribe el servicio tal como aparece en la orden médica (por ejemplo: «Terapia física integral»).",
  servicioInvalido: "Escribe el nombre del servicio que aparece en la orden, en una sola línea.",

  edad: "¿Qué edad tiene el paciente? Escribe solo el número.",
  edadInvalida: "Escribe la edad del paciente solo con números (por ejemplo: 45).",

  orden:
    "Envía una foto completa y legible de la *orden médica* (o el PDF). Que se vean todos los bordes y con buena luz.",
  ordenRecibida: "Recibimos la orden. La revisaremos en un momento.",
  faltaOrden:
    "Para continuar con la revisión necesitamos una foto completa y legible de la orden de servicio. Por favor envíala por este chat. La solicitud todavía está pendiente y no corresponde a una cita confirmada.",

  historia:
    "Ahora envía la *historia clínica completa*: una foto por página (o el PDF). Cuando termines de enviar todas las páginas, escribe *LISTO*.",
  paginaRecibida: (n: number) =>
    `Recibimos ${n === 1 ? "1 página" : `${n} páginas`}. Si hay más, envíalas; cuando termines escribe *LISTO*.`,
  historiaSinPaginas: "Todavía no hemos recibido la historia clínica. Envía las fotos de cada página o el PDF.",
  historiaIncompleta:
    "Parece que faltan páginas de la historia clínica (en el documento aparece la numeración «Página X de Y»). Si las tienes, envíalas por este chat; si no, el equipo lo revisará.",
  faltaHistoria:
    "Para preparar tu solicitud también necesitamos la historia clínica completa. Si no la tienes, debes solicitarla a tu EPS y enviarla por este medio. Por ahora la solicitud queda pendiente de ese documento.",

  terapiaPrevia:
    "¿El paciente ha recibido terapias para el diagnóstico que aparece en esta orden? Responde *SÍ*, *NO* o *NO SÉ*.\n" +
    "(Te lo preguntamos porque las terapias realizadas por otro diagnóstico no cuentan como antecedente.)",
  terapiaNoIniciada:
    "Gracias por aclararlo. Vamos a dejar esta información registrada junto con la orden y la historia clínica para que el equipo revise cuál es la ruta que corresponde.",

  plan: "Como ya inició terapias, necesitamos una foto del *plan o programa de tratamiento*. Envíala ahora, o escribe *NO TENGO*.",
  planRecibido: "Recibimos el plan de tratamiento.",
  faltaPlan:
    "Para revisar la continuidad de las terapias necesitamos una foto del plan o programa de tratamiento. Si no lo tienes, consulta con PROMOVER cómo obtenerlo. La solicitud seguirá pendiente hasta recibirlo.",

  preferencia:
    "¿Tienes alguna preferencia de día u horario? Es solo informativa, no es una reserva. Escribe tu preferencia o *NO*.",

  // PRELIMINAR: el uso de estos factores como filtro requiere política aprobada (documento 07).
  factores:
    "Para organizar la atención, ¿aplica alguna de estas situaciones al paciente? Responde con los números separados por coma, o *NINGUNA*:\n" +
    "1. Vive fuera de Cali\n2. Tiene movilidad reducida\n3. Está en embarazo",
  factoresInvalidos: "Responde con los números (por ejemplo: 1, 3) o escribe *NINGUNA*.",

  recibida:
    "Gracias. Registramos la información recibida para revisión. Esto no confirma una cita ni garantiza disponibilidad. " +
    "El equipo de PROMOVER revisará los documentos y se comunicará contigo si necesita información adicional o para continuar el proceso.",
  yaRegistrada:
    "Tu solicitud ya está registrada y en revisión. Esto no confirma una cita.\n" +
    "Si necesitas enviar otro documento, envíalo por aquí. Para registrar una solicitud distinta (otra orden o diagnóstico), escribe *NUEVA*.",
  documentoAgregado: "Recibimos el documento y lo agregamos a tu solicitud.",
  documentosDespues: "Primero necesitamos algunos datos. Te pediremos los documentos en un momento.",

  audio:
    "Para registrar correctamente tu solicitud, por favor escribe la información por este chat. En este canal no gestionamos audios ni llamadas.",
  noSoportado: "Por este canal solo podemos recibir mensajes de texto, fotos y archivos PDF.",

  // PRELIMINAR: protocolo de urgencias pendiente de aprobación institucional (documento 08, pendiente 10).
  urgencia:
    "Este canal no atiende urgencias. Si el paciente tiene una urgencia, acude al servicio de urgencias más cercano o llama a la línea 123.",
  persona: "Registramos que quieres hablar con una persona. El equipo te contactará. Mientras tanto, puedes seguir con la solicitud.",
  cancelada:
    "Registramos que no deseas continuar con la solicitud. El equipo la cerrará. Si cambias de opinión, escríbenos.",

  // Avisos después de leer un documento (los envía el sistema cuando el worker termina).
  reenvioIlegible:
    "No logramos leer toda la información del documento. Por favor envía una nueva foto, con buena iluminación, enfocada y con todos los bordes visibles. Si tiene varias páginas, envíalas todas.",
  reenvioNoProcesable:
    "No pudimos abrir uno de los archivos que enviaste. Por favor envíalo de nuevo como foto (JPG o PNG) o como PDF sin contraseña.",
} as const;
