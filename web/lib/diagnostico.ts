// Diagnóstico para el panel «Registro de errores» (solo super_admin): qué significa cada código,
// cuál es la causa más probable y cómo se corrige. Funciones puras, con pruebas en diagnostico.test.ts.

export type Gravedad = "critica" | "alta" | "media" | "baja";

export type Explicacion = {
  titulo: string;
  causa: string;
  solucion: string;
  gravedad: Gravedad;
};

export const PESO_GRAVEDAD: Record<Gravedad, number> = { critica: 100, alta: 40, media: 12, baja: 3 };

export const ETIQUETA_GRAVEDAD: Record<Gravedad, string> = {
  critica: "Crítico",
  alta: "Alto",
  media: "Medio",
  baja: "Bajo",
};

export const ETIQUETA_ORIGEN: Record<string, string> = {
  webhook: "Webhook de WhatsApp",
  envio: "Envío de respuestas",
  bot: "Conversación del bot",
  ocr: "OCR",
  worker: "Worker de OCR",
  sistema: "Sistema",
};

const FIJOS: Record<string, Explicacion> = {
  // ---- Webhook (mensajes que llegan de Kapso / Meta)
  firma_invalida: {
    titulo: "Kapso envía mensajes con una firma que no coincide",
    causa: "El secreto del webhook en Kapso es distinto de KAPSO_WEBHOOK_SECRET en Vercel (o se regeneró en Kapso). Todos los mensajes se rechazan.",
    solucion: "Copia el secreto del webhook desde Kapso, pégalo en KAPSO_WEBHOOK_SECRET (Vercel → Settings → Environment Variables, entorno Production) y vuelve a publicar (Redeploy).",
    gravedad: "critica",
  },
  falta_KAPSO_WEBHOOK_SECRET: {
    titulo: "Falta KAPSO_WEBHOOK_SECRET en Vercel",
    causa: "Sin el secreto no se puede verificar ningún mensaje, así que todos se rechazan.",
    solucion: "Agrega KAPSO_WEBHOOK_SECRET en Vercel (Production) con el secreto del webhook de Kapso y vuelve a publicar.",
    gravedad: "critica",
  },
  meta_firma_invalida: {
    titulo: "Meta envía mensajes con una firma que no coincide",
    causa: "META_APP_SECRET no corresponde a la app de Meta, o el webhook de Kapso apunta por error a /api/whatsapp (la ruta de Meta directo).",
    solucion: "Si usas Kapso, la URL del webhook debe ser /api/webhook/whatsapp. Si usas Meta directo, revisa META_APP_SECRET.",
    gravedad: "critica",
  },
  phone_number_id_distinto: {
    titulo: "Llegan mensajes de un número distinto al configurado",
    causa: "KAPSO_PHONE_NUMBER_ID (o META_PHONE_NUMBER_ID) no coincide con el ID del número que envía los mensajes. El bot los ignora sin responder.",
    solucion: "En Kapso, copia el «Phone number ID» del número (no el número +57…) y ponlo en la variable de Vercel. El detalle muestra los últimos 4 dígitos del que llegó.",
    gravedad: "critica",
  },
  falta_KAPSO_PHONE_NUMBER_ID: {
    titulo: "Falta KAPSO_PHONE_NUMBER_ID en Vercel",
    causa: "Sin el ID del número no se pueden aceptar mensajes ni enviar respuestas por Kapso.",
    solucion: "Agrega KAPSO_PHONE_NUMBER_ID en Vercel (Production) con el «Phone number ID» de Kapso y vuelve a publicar.",
    gravedad: "critica",
  },
  bot_pausado: {
    titulo: "Llegaron mensajes con el bot pausado",
    causa: "El interruptor del bot está apagado: los mensajes se reciben pero no se responden ni se guardan.",
    solucion: "Enciende el bot con el interruptor de la barra superior.",
    gravedad: "alta",
  },
  limite_superado: {
    titulo: "Un número superó el límite de mensajes",
    causa: "Más de 30 mensajes en 5 minutos desde el mismo número. Puede ser un paciente reenviando muchas fotos o un abuso.",
    solucion: "Si es un paciente real, espera 5 minutos y pídele que envíe los documentos de a uno. Si se repite mucho, revisa si es spam.",
    gravedad: "baja",
  },
  registro_mensaje: {
    titulo: "No se pudo registrar el mensaje en la base",
    causa: "Supabase no respondió o falta la tabla mensajes_procesados (migración no aplicada). Kapso reintentará.",
    solucion: "Revisa que Supabase esté en línea y que SUPABASE_SECRET_KEY sea correcta en Vercel.",
    gravedad: "alta",
  },
  json_invalido: {
    titulo: "Llegó una petición con formato inválido",
    causa: "El cuerpo del webhook no es JSON. Casi siempre es una prueba manual o un robot.",
    solucion: "Si solo aparece de vez en cuando, no requiere acción.",
    gravedad: "baja",
  },

  // ---- Envío de respuestas
  falta_configuracion_kapso: {
    titulo: "Falta configuración de Kapso para responder",
    causa: "KAPSO_API_KEY o KAPSO_PHONE_NUMBER_ID no están en Vercel: el bot recibe el mensaje pero no puede contestar.",
    solucion: "Agrega ambas variables en Vercel (Production) y vuelve a publicar.",
    gravedad: "critica",
  },
  falta_configuracion_meta: {
    titulo: "Falta configuración de Meta para responder",
    causa: "No hay KAPSO_API_KEY, así que el bot intenta responder por la API de Meta, pero faltan META_WHATSAPP_TOKEN o META_PHONE_NUMBER_ID.",
    solucion: "Si usas Kapso, agrega KAPSO_API_KEY en Vercel. Si usas Meta directo, agrega las variables META_*.",
    gravedad: "critica",
  },
  falta_configuracion_supabase_admin: {
    titulo: "Falta la clave secreta de Supabase en Vercel",
    causa: "Sin SUPABASE_SECRET_KEY el bot no puede leer ni guardar nada.",
    solucion: "Agrega SUPABASE_SECRET_KEY en Vercel (Production) y vuelve a publicar.",
    gravedad: "critica",
  },

  // ---- Conversación del bot (base de datos)
  crear_solicitud: {
    titulo: "No se pudo crear la solicitud",
    causa: "Error al escribir en la tabla solicitudes (base caída, permisos o una migración no aplicada).",
    solucion: "Revisa que todas las migraciones de supabase/migrations estén aplicadas en Supabase.",
    gravedad: "alta",
  },
  actualizar_solicitud: {
    titulo: "No se pudo actualizar la solicitud",
    causa: "Un dato no cumple las restricciones de la tabla o falta una columna (migración pendiente).",
    solucion: "Revisa las migraciones aplicadas. Si se repite con un mismo paciente, revisa su conversación en el panel.",
    gravedad: "alta",
  },
  guardar_conversacion: {
    titulo: "No se pudo guardar el paso de la conversación",
    causa: "Error al escribir en la tabla conversaciones.",
    solucion: "Revisa el estado de Supabase y las migraciones aplicadas.",
    gravedad: "alta",
  },
  encolar_documento: {
    titulo: "No se pudo poner un documento en la cola del OCR",
    causa: "Error al escribir en trabajos_ocr.",
    solucion: "Revisa el estado de Supabase y las migraciones aplicadas.",
    gravedad: "alta",
  },
  simulador_desactivado: {
    titulo: "Se usó el simulador con el modo simulación apagado",
    causa: "Alguien abrió el simulador después de apagarlo.",
    solucion: "No requiere acción en operación real.",
    gravedad: "baja",
  },

  // ---- Aviso del worker al panel
  aviso_panel_401: {
    titulo: "El worker no puede avisar al panel (no autorizado)",
    causa: "WORKER_SECRET del worker (worker/.env) es distinto del de Vercel. El OCR funciona, pero el bot no le escribe al paciente cuando falta algo.",
    solucion: "Pon el mismo WORKER_SECRET (32 caracteres o más) en worker/.env y en Vercel, vuelve a publicar y reinicia el worker.",
    gravedad: "alta",
  },
  aviso_panel_500: {
    titulo: "El panel falló al procesar el aviso del worker",
    causa: "Error al responderle al paciente después del OCR (revisa los errores de «Envío de respuestas» de la misma hora).",
    solucion: "Corrige primero los errores de envío; el resto suele resolverse solo.",
    gravedad: "media",
  },
  aviso_panel_sin_conexion: {
    titulo: "El worker no llega al panel",
    causa: "El equipo de la sede no tiene internet o PANEL_URL en worker/.env está mal.",
    solucion: "Revisa la conexión del equipo y que PANEL_URL sea https://chatbotpromover.vercel.app.",
    gravedad: "media",
  },
  aviso_fallo: {
    titulo: "Falló el aviso de documento procesado",
    causa: "Error al escribirle al paciente después del OCR.",
    solucion: "Revisa los errores de «Envío de respuestas» de la misma hora.",
    gravedad: "media",
  },
};

/** Errores de envío por código HTTP (kapso_envio_401, meta_envio_400…). */
function explicarEnvio(proveedor: "kapso" | "meta", estado: number): Explicacion {
  const nombre = proveedor === "kapso" ? "Kapso" : "Meta";
  const clave = proveedor === "kapso" ? "KAPSO_API_KEY" : "META_WHATSAPP_TOKEN";
  const numero = proveedor === "kapso" ? "KAPSO_PHONE_NUMBER_ID" : "META_PHONE_NUMBER_ID";
  if (estado === 401 || estado === 403) {
    return {
      titulo: `${nombre} rechaza la clave al responder (${estado})`,
      causa: `${clave} es incorrecta, se revocó o venció. El bot recibe los mensajes pero ninguna respuesta sale.`,
      solucion: `Genera una clave nueva en ${nombre}, actualiza ${clave} en Vercel y vuelve a publicar.`,
      gravedad: "critica",
    };
  }
  if (estado === 404) {
    return {
      titulo: `${nombre} no encuentra el número desde el que se responde (404)`,
      causa: `${numero} no corresponde a un número de la cuenta.`,
      solucion: `Copia el «Phone number ID» correcto en ${numero} (Vercel) y vuelve a publicar.`,
      gravedad: "critica",
    };
  }
  if (estado === 400 || estado === 422) {
    return {
      titulo: `${nombre} no aceptó un mensaje (${estado})`,
      causa:
        "Lo más común: pasaron más de 24 horas desde el último mensaje del paciente (WhatsApp solo permite responder dentro de esa ventana sin plantilla), o el número del paciente no es válido.",
      solucion: "Si es un caso aislado, contacta al paciente por otro medio. Si pasa con todos, revisa el número configurado y el estado de la cuenta en " + nombre + ".",
      gravedad: "media",
    };
  }
  if (estado === 429) {
    return {
      titulo: `${nombre} limitó el envío (429)`,
      causa: "Se superó el límite de mensajes por segundo o el límite diario de la cuenta de WhatsApp.",
      solucion: `Espera unos minutos. Si se repite, revisa el nivel de mensajería de la cuenta en ${nombre}/Meta.`,
      gravedad: "alta",
    };
  }
  if (estado >= 500) {
    return {
      titulo: `${nombre} tuvo una falla interna (${estado})`,
      causa: `Problema temporal en ${nombre}. El proveedor reintenta el webhook y el mensaje se procesa de nuevo.`,
      solucion: `Si dura más de 15 minutos, revisa la página de estado de ${nombre}.`,
      gravedad: "media",
    };
  }
  return {
    titulo: `${nombre} respondió con error ${estado} al enviar`,
    causa: "Respuesta inesperada del proveedor.",
    solucion: `Revisa el registro de mensajes en ${nombre} para ver el detalle.`,
    gravedad: "media",
  };
}

/** Errores técnicos del worker (ocr_<NombreDeExcepción>). */
function explicarWorker(excepcion: string): Explicacion {
  if (/HTTPStatusError|ConnectError|ConnectTimeout|ReadTimeout|RemoteProtocolError/.test(excepcion)) {
    return {
      titulo: "El worker no pudo descargar un documento",
      causa: "Falló la descarga desde Kapso/Meta: clave del worker vencida (KAPSO_API_KEY o META token en worker/.env), el archivo ya expiró o no hay internet.",
      solucion: "Revisa las claves de worker/.env y la conexión del equipo. Los archivos de WhatsApp expiran: si pasó mucho tiempo, pide al paciente que lo reenvíe.",
      gravedad: "alta",
    };
  }
  if (/Tesseract/.test(excepcion)) {
    return {
      titulo: "Tesseract no está instalado o no se encuentra",
      causa: "El motor de OCR no está en el equipo de la sede o cambió su ruta.",
      solucion: "Vuelve a ejecutar worker/preparar.ps1 en el equipo de la sede.",
      gravedad: "critica",
    };
  }
  if (/MemoryError|DecompressionBomb/.test(excepcion)) {
    return {
      titulo: "Un documento era demasiado grande para procesar",
      causa: "Imagen o PDF enorme (o malicioso) que agotó la memoria.",
      solucion: "Pide al paciente una foto normal del documento.",
      gravedad: "media",
    };
  }
  return {
    titulo: `Fallo técnico del worker (${excepcion})`,
    causa: "Error inesperado al procesar un documento. El worker reintenta y, tras varios intentos, deja el trabajo en ERROR.",
    solucion: "Revisa worker/logs en el equipo de la sede a la misma hora.",
    gravedad: "media",
  };
}

/** Códigos que guarda el worker en trabajos_ocr.error_codigo. */
export function explicarErrorOcr(codigo: string): Explicacion {
  if (codigo === "interrumpido") {
    return {
      titulo: "Trabajos interrumpidos por un apagado del worker",
      causa: "El equipo se apagó o el worker se cerró a mitad de un documento; al arrancar, el trabajo vuelve a la cola.",
      solucion: "No requiere acción si el worker volvió a funcionar.",
      gravedad: "baja",
    };
  }
  return explicarWorker(codigo);
}

export function explicarError(codigo: string): Explicacion {
  if (FIJOS[codigo]) return FIJOS[codigo];
  const envio = /^(kapso|meta)_envio_(\d{3})$/.exec(codigo);
  if (envio) return explicarEnvio(envio[1] as "kapso" | "meta", Number(envio[2]));
  const aviso = /^aviso_panel_(\d{3})$/.exec(codigo);
  if (aviso) return { ...FIJOS.aviso_panel_500, titulo: `El worker recibió ${aviso[1]} al avisar al panel` };
  if (codigo.startsWith("ocr_")) return explicarWorker(codigo.slice(4));
  return {
    titulo: `Error técnico: ${codigo}`,
    causa: "Código sin explicación registrada.",
    solucion: "Revisa los registros de Vercel (Logs) a la misma hora para ver el detalle.",
    gravedad: "media",
  };
}

// ------------------------------------------------------------------- errores más probables

export type FilaRegistro = {
  id: number;
  origen: string;
  codigo: string;
  detalle: string | null;
  repeticiones: number;
  primero_en: string;
  ultimo_en: string;
  revisado: boolean;
};

export type GrupoError = {
  origen: string;
  codigo: string;
  total: number;
  ultimo_en: string;
  detalle: string | null;
  explicacion: Explicacion;
  puntaje: number;
};

/**
 * Agrupa los registros abiertos por código y los ordena por probabilidad de ser la causa del
 * problema actual: gravedad × frecuencia (logarítmica) × qué tan reciente es.
 */
export function agruparErrores(filas: FilaRegistro[], ahora = Date.now()): GrupoError[] {
  const grupos = new Map<string, GrupoError>();
  for (const f of filas) {
    if (f.revisado) continue;
    const clave = `${f.origen}|${f.codigo}`;
    const g = grupos.get(clave);
    if (g) {
      g.total += f.repeticiones;
      if (f.ultimo_en > g.ultimo_en) {
        g.ultimo_en = f.ultimo_en;
        g.detalle = f.detalle ?? g.detalle;
      }
    } else {
      grupos.set(clave, {
        origen: f.origen,
        codigo: f.codigo,
        total: f.repeticiones,
        ultimo_en: f.ultimo_en,
        detalle: f.detalle,
        explicacion: explicarError(f.codigo),
        puntaje: 0,
      });
    }
  }
  const lista = [...grupos.values()];
  for (const g of lista) {
    const horas = Math.max(0, (ahora - new Date(g.ultimo_en).getTime()) / 3_600_000);
    const recencia = horas < 1 ? 1 : horas < 24 ? 0.6 : horas < 72 ? 0.3 : 0.1;
    g.puntaje = PESO_GRAVEDAD[g.explicacion.gravedad] * (1 + Math.log10(g.total)) * recencia;
  }
  return lista.sort((a, b) => b.puntaje - a.puntaje || b.ultimo_en.localeCompare(a.ultimo_en));
}

// ------------------------------------------------------------------- revisión de configuración

export type EstadoSistema = {
  bot_activo: boolean;
  ultimo_mensaje_recibido: string | null;
  mensajes_24h: number;
  worker_ultimo_latido: string | null;
  worker_equipo: string | null;
  ocr_pendientes: number;
  ocr_con_error: number;
  ocr_errores_por_codigo: Record<string, number>;
};

/** Solo dice si cada variable existe (nunca su valor). */
export type VariablesPresentes = {
  SUPABASE_SECRET_KEY: boolean;
  KAPSO_API_KEY: boolean;
  KAPSO_PHONE_NUMBER_ID: boolean;
  KAPSO_WEBHOOK_SECRET: boolean;
  META_APP_SECRET: boolean;
  META_PHONE_NUMBER_ID: boolean;
  META_WHATSAPP_TOKEN: boolean;
  WORKER_SECRET_VALIDO: boolean;
  MODO_SIMULACION: boolean;
};

export type Revision = {
  id: string;
  ok: boolean;
  titulo: string;
  detalle: string;
  gravedad: Gravedad;
};

const HORA = 3_600_000;

export function revisarConfiguracion(v: VariablesPresentes, e: EstadoSistema | null, ahora = Date.now()): Revision[] {
  const r: Revision[] = [];
  const usaKapso = v.KAPSO_API_KEY || v.KAPSO_WEBHOOK_SECRET || v.KAPSO_PHONE_NUMBER_ID;

  r.push({
    id: "supabase",
    ok: v.SUPABASE_SECRET_KEY,
    titulo: "Clave secreta de Supabase",
    detalle: v.SUPABASE_SECRET_KEY ? "SUPABASE_SECRET_KEY está configurada." : "Falta SUPABASE_SECRET_KEY: el bot no puede leer ni guardar.",
    gravedad: "critica",
  });

  if (usaKapso) {
    const faltan = (["KAPSO_API_KEY", "KAPSO_PHONE_NUMBER_ID", "KAPSO_WEBHOOK_SECRET"] as const).filter((k) => !v[k]);
    r.push({
      id: "canal",
      ok: faltan.length === 0,
      titulo: "Canal de WhatsApp (Kapso)",
      detalle: faltan.length
        ? `Faltan en Vercel: ${faltan.join(", ")}. Sin ellas el bot no recibe o no responde mensajes.`
        : "Las tres variables de Kapso están configuradas. El webhook en Kapso debe apuntar a /api/webhook/whatsapp.",
      gravedad: "critica",
    });
  } else {
    const faltan = (["META_APP_SECRET", "META_PHONE_NUMBER_ID", "META_WHATSAPP_TOKEN"] as const).filter((k) => !v[k]);
    r.push({
      id: "canal",
      ok: faltan.length === 0,
      titulo: "Canal de WhatsApp (Meta directo)",
      detalle: faltan.length
        ? `No hay variables de Kapso ni de Meta completas. Faltan: ${faltan.join(", ")}.`
        : "Las variables de Meta están configuradas. El webhook en Meta debe apuntar a /api/whatsapp.",
      gravedad: "critica",
    });
  }

  r.push({
    id: "simulacion",
    ok: !v.MODO_SIMULACION,
    titulo: "Modo simulación apagado",
    detalle: v.MODO_SIMULACION
      ? "El modo simulación está encendido: apágalo en Configuraciones cuando haya pacientes reales."
      : "El modo simulación está apagado.",
    gravedad: "media",
  });

  r.push({
    id: "worker_secret",
    ok: v.WORKER_SECRET_VALIDO,
    titulo: "Secreto del worker",
    detalle: v.WORKER_SECRET_VALIDO
      ? "WORKER_SECRET está configurado (32 caracteres o más)."
      : "Falta WORKER_SECRET o tiene menos de 32 caracteres: el bot no podrá escribirle al paciente después del OCR.",
    gravedad: "alta",
  });

  if (!e) {
    r.push({
      id: "estado",
      ok: false,
      titulo: "Estado del sistema",
      detalle: "No se pudo leer el estado del sistema. ¿Se aplicó la migración 20261127000000_registro_errores.sql en Supabase?",
      gravedad: "alta",
    });
    return r;
  }

  r.push({
    id: "bot",
    ok: e.bot_activo,
    titulo: "Bot encendido",
    detalle: e.bot_activo ? "El bot está encendido." : "El bot está pausado: recibe mensajes pero no responde. Enciéndelo con el interruptor de la barra superior.",
    gravedad: "critica",
  });

  const ultimo = e.ultimo_mensaje_recibido ? new Date(e.ultimo_mensaje_recibido).getTime() : null;
  const llegan = ultimo !== null && ahora - ultimo < 24 * HORA;
  r.push({
    id: "mensajes",
    ok: llegan,
    titulo: "Llegan mensajes de WhatsApp",
    detalle: llegan
      ? `${e.mensajes_24h} mensaje(s) recibido(s) en las últimas 24 horas.`
      : ultimo === null
        ? "Nunca se ha recibido un mensaje válido. Revisa que el webhook de Kapso apunte a https://chatbotpromover.vercel.app/api/webhook/whatsapp, que el evento sea whatsapp.message.received y que el secreto coincida."
        : "No llega ningún mensaje válido hace más de 24 horas. Si los pacientes sí escriben, revisa el webhook en Kapso y los errores de abajo.",
    gravedad: e.bot_activo ? "alta" : "media",
  });

  const latido = e.worker_ultimo_latido ? new Date(e.worker_ultimo_latido).getTime() : null;
  const workerVivo = latido !== null && ahora - latido < 5 * 60_000;
  r.push({
    id: "worker",
    ok: workerVivo,
    titulo: "Worker de OCR funcionando",
    detalle: workerVivo
      ? `Activo${e.worker_equipo ? ` en ${e.worker_equipo}` : ""}.`
      : latido === null
        ? "El worker nunca ha enviado señal de vida. Instálalo en el equipo de la sede (worker/README.md)."
        : "El worker no envía señal de vida hace más de 5 minutos: el equipo está apagado, sin internet o el worker se cerró.",
    gravedad: e.ocr_pendientes > 0 ? "alta" : "media",
  });

  r.push({
    id: "ocr",
    ok: e.ocr_con_error === 0,
    titulo: "Documentos sin errores de OCR",
    detalle: e.ocr_con_error
      ? `${e.ocr_con_error} documento(s) quedaron en ERROR tras varios intentos. Mira «Errores del OCR» más abajo.`
      : "No hay documentos en ERROR.",
    gravedad: "media",
  });

  return r;
}

/** Problemas de configuración primero (de mayor a menor gravedad); luego los que están bien. */
export function ordenarRevisiones(r: Revision[]): Revision[] {
  return [...r].sort((a, b) => Number(a.ok) - Number(b.ok) || PESO_GRAVEDAD[b.gravedad] - PESO_GRAVEDAD[a.gravedad]);
}
