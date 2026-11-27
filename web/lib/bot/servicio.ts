// Conecta el motor de conversación con la base de datos y el canal de envío.
// Los logs solo llevan códigos técnicos: nunca teléfonos, nombres ni texto de los mensajes.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cargarCatalogo } from "@/lib/catalogo-agendas";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { enviar } from "./canal";
import { botActivo } from "./estado";
import { M } from "./mensajes";
import { estadoRecoleccion, type DocumentoRecibido } from "./recoleccion";
import { ESTADO_INICIAL, procesar, type Accion, type Canal, type Datos, type Entrada, type Estado, type Paso } from "./motor";

const MAX_DOCUMENTOS_POR_SOLICITUD = 30;

type Conversacion = { telefono: string; solicitud_id: string | null; paso: Paso; datos: Datos };

async function limpiarAntiguos(db: SupabaseClient) {
  const hace2dias = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const hace7dias = new Date(Date.now() - 7 * 86_400_000).toISOString();
  // Conversaciones que nunca llegaron a autorizar (sin solicitud) e IDs de mensajes viejos.
  await db.from("conversaciones").delete().is("solicitud_id", null).lt("actualizado_en", hace2dias);
  await db.from("mensajes_procesados").delete().lt("recibido_en", hace7dias);
}

async function alertar(db: SupabaseClient, solicitudId: string, codigo: string, detalle: string) {
  // No repetir una alerta abierta con el mismo código.
  const { count } = await db
    .from("alertas")
    .select("id", { count: "exact", head: true })
    .eq("solicitud_id", solicitudId)
    .eq("codigo", codigo)
    .eq("resuelta", false);
  if (!count) await db.from("alertas").insert({ solicitud_id: solicitudId, codigo, detalle });
}

/** RB-064: varias solicitudes activas con el mismo documento se marcan para revisión. */
async function revisarMismoPaciente(db: SupabaseClient, documento: string) {
  const { data } = await db.from("solicitudes").select("id").eq("documento", documento);
  const ids = (data ?? []).map((f) => f.id as string);
  if (ids.length < 2) return;
  const detalle = `Este paciente tiene ${ids.length} solicitudes activas con el mismo documento. Confirmar que son independientes (otra orden o diagnóstico) y no un duplicado.`;
  for (const id of ids) await alertar(db, id, "MISMO_PACIENTE_MULTIPLES_SOLICITUDES", detalle);
}

async function aplicar(
  db: SupabaseClient,
  acciones: Accion[],
  solicitudId: string | null,
  telefono: string,
  datos: Datos,
): Promise<string | null> {
  for (const a of acciones) {
    switch (a.tipo) {
      case "crearSolicitud": {
        const { data, error } = await db
          .from("solicitudes")
          .insert({
            telefono,
            creada_en: datos.inicio ?? new Date().toISOString(),
            consentimiento_en: new Date().toISOString(),
            estado: "ESPERANDO_DATOS",
          })
          .select("id")
          .single();
        if (error) throw new Error("crear_solicitud");
        solicitudId = data.id as string;
        break;
      }
      case "nuevaSolicitud":
        solicitudId = null;
        break;
      case "actualizar": {
        if (!solicitudId) break;
        const { error } = await db.from("solicitudes").update(a.campos).eq("id", solicitudId);
        if (error) throw new Error("actualizar_solicitud");
        if (a.campos.documento) await revisarMismoPaciente(db, a.campos.documento);
        break;
      }
      case "encolar": {
        if (!solicitudId) break;
        // Tope por solicitud: evita que alguien llene la cola (y el equipo de la sede) con archivos.
        const { count } = await db
          .from("trabajos_ocr")
          .select("id", { count: "exact", head: true })
          .eq("solicitud_id", solicitudId);
        if ((count ?? 0) >= MAX_DOCUMENTOS_POR_SOLICITUD) {
          await alertar(db, solicitudId, "DEMASIADOS_DOCUMENTOS",
            `La solicitud alcanzó el máximo de ${MAX_DOCUMENTOS_POR_SOLICITUD} documentos y no se procesarán más. Revisar el chat en WhatsApp.`);
          break;
        }
        const { error } = await db
          .from("trabajos_ocr")
          .insert({ solicitud_id: solicitudId, media_id: a.mediaId, tipo_documento: a.tipoDocumento });
        if (error) throw new Error("encolar_documento");
        break;
      }
      case "alerta":
        if (solicitudId) await alertar(db, solicitudId, a.codigo, a.detalle);
        break;
    }
  }
  return solicitudId;
}

/** Procesa un mensaje entrante del paciente y envía las respuestas. */
/** ¿El fallo fue al enviar la respuesta (proveedor o configuración) o dentro del bot (base de datos)? */
export function origenDeFallo(codigo: string): "envio" | "bot" {
  return /_envio_|^falta_configuracion_(kapso|meta)$/.test(codigo) ? "envio" : "bot";
}

export async function manejarEntrada(telefono: string, entrada: Entrada, canal: Canal) {
  const db = crearClienteAdmin();
  await limpiarAntiguos(db);

  const { data: conv } = await db.from("conversaciones").select("*").eq("telefono", telefono).maybeSingle<Conversacion>();
  const estado: Estado = conv ? { paso: conv.paso, datos: conv.datos ?? {} } : ESTADO_INICIAL;

  let solicitud = null;
  let documentos: DocumentoRecibido[] = [];
  if (conv?.solicitud_id) {
    const { data: docs } = await db.from("trabajos_ocr").select("tipo_documento, estado").eq("solicitud_id", conv.solicitud_id);
    documentos = (docs ?? []) as DocumentoRecibido[];
    const { data } = await db
      .from("solicitudes")
      .select("documento, nombre, eps, eps_texto, servicio_texto, servicio_cita_id, edad, historia_estado")
      .eq("id", conv.solicitud_id)
      .maybeSingle();
    solicitud = data;
  }

  // Sin catálogo (error de lectura) el bot sigue funcionando con servicio y horario en texto libre.
  const catalogo = await cargarCatalogo(db);
  const r = procesar(estado, entrada, { ahora: new Date().toISOString(), solicitud, catalogo, documentos });
  const datos: Datos = { ...r.estado.datos, canal };

  const solicitudId = await aplicar(db, r.acciones, conv?.solicitud_id ?? null, telefono, datos);

  if (solicitudId) {
    await db.from("solicitudes").update({ ultima_interaccion: new Date().toISOString() }).eq("id", solicitudId);
    await db.rpc("recalcular_estado", { p_id: solicitudId });
  }

  if (r.estado.paso === "INICIO" && !solicitudId) {
    // No autorizó: no se guarda nada de la conversación.
    await db.from("conversaciones").delete().eq("telefono", telefono);
  } else {
    const { error } = await db.from("conversaciones").upsert({
      telefono,
      solicitud_id: solicitudId,
      paso: r.estado.paso,
      datos,
      actualizado_en: new Date().toISOString(),
    });
    if (error) throw new Error("guardar_conversacion");
  }

  await enviar(db, canal, telefono, r.respuestas);
}

/**
 * Aviso al paciente después de que el worker lee un documento. Solo escribe si hay algo que
 * pedir (reenvío o páginas faltantes); no envía mensajes de "todo bien".
 */
export async function avisarDocumentoProcesado(trabajoId: number) {
  const db = crearClienteAdmin();
  const { data: trabajo } = await db
    .from("trabajos_ocr")
    .select("solicitud_id, estado, tipo_documento, error_codigo")
    .eq("id", trabajoId)
    .maybeSingle();
  if (!trabajo) return "sin_trabajo";

  const { data: conv } = await db
    .from("conversaciones")
    .select("telefono, paso, datos")
    .eq("solicitud_id", trabajo.solicitud_id)
    .maybeSingle<Pick<Conversacion, "telefono" | "paso" | "datos">>();
  if (!conv) return "sin_conversacion";

  let texto: string | null = null;
  // Flujo corto: si con este documento ya llegó todo, se le avisa al paciente y la conversación termina.
  if (conv.paso === "RECOLECTANDO" && trabajo.estado !== "REENVIO_REQUERIDO") {
    const [{ data: s }, { data: docs }] = await Promise.all([
      db.from("solicitudes").select("documento, nombre").eq("id", trabajo.solicitud_id).maybeSingle(),
      db.from("trabajos_ocr").select("tipo_documento, estado").eq("solicitud_id", trabajo.solicitud_id),
    ]);
    if (estadoRecoleccion(s ?? {}, (docs ?? []) as DocumentoRecibido[]).tipo === "COMPLETA") {
      texto = M.recibidoTodo;
      await db.from("conversaciones").update({ paso: "FINAL", datos: { ...(conv.datos ?? {}), completa: true, recordado: new Date().toISOString() }, actualizado_en: new Date().toISOString() }).eq("solicitud_id", trabajo.solicitud_id);
    }
  }
  if (!texto && trabajo.estado === "REENVIO_REQUERIDO") {
    texto = trabajo.error_codigo ? M.reenvioNoProcesable : M.reenvioIlegible;
  } else if (!texto && trabajo.tipo_documento === "HISTORIA" && conv.paso !== "HISTORIA" && conv.paso !== "RECOLECTANDO") {
    // Mientras el paciente sigue enviando páginas no se interrumpe; al escribir LISTO el bot ya avisa.
    const { data: s } = await db.from("solicitudes").select("historia_estado").eq("id", trabajo.solicitud_id).maybeSingle();
    if (s?.historia_estado === "POSIBLEMENTE_INCOMPLETA") texto = M.historiaIncompleta;
  }
  if (!texto) return "sin_aviso";
  const canal = conv.datos?.canal ?? "whatsapp";
  if (canal !== "simulador" && !(await botActivo(db))) return "bot_pausado";

  await enviar(db, canal, conv.telefono, [texto]);
  return "avisado";
}
