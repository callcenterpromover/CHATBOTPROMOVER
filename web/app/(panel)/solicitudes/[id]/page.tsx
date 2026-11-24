import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Dato, Insignia, Tarjeta, claseBoton, claseBotonSecundario, claseCampo } from "@/app/componentes";
import { Icono } from "@/components/Iconos";
import {
  AUTORIZACION_ESTADO,
  CAMPOS,
  CATEGORIAS,
  EPS,
  ESTADOS,
  FACTORES,
  HISTORIA_ESTADO,
  ORDEN_ESTADO,
  ORIGENES,
  PLAN_ESTADO,
  VERIFICACION,
  codigoSolicitud,
  etiqueta,
  fecha,
  fechaHora,
  tonoEstado,
  type FilaLista,
} from "@/lib/catalogo";
import { claseServicio } from "@/lib/bot/flujo";
import type { ServicioCita } from "@/lib/horarios";
import { verificaciones, type IpsSos, type Lineamiento } from "@/lib/lineamientos";
import { NOMBRE_CLASE, documentosEditables, requisitos, type EstadoRequisito } from "@/lib/requisitos";
import { esAdmin } from "@/lib/roles";
import { Notificaciones } from "@/components/Notificaciones";
import { requerirSesion } from "@/lib/supabase/server";
import { asignarSolicitud, devolverSolicitud, tomarSolicitud } from "../../lista-espera/actions";
import {
  agregarObservacion,
  borrarObservacion,
  cerrarSolicitud,
  corregirCampo,
  guardarGestion,
  marcarAlerta,
} from "./actions";

// Detalle de una solicitud (docs/superpowers/specs/2026-11-24-rediseno-interfaz.md §5): encabezado con quién es y
// qué pide, «Qué falta» según el tipo de solicitud, y a la derecha la columna de trabajo con «Revisado».

const MENSAJES_OK: Record<string, string> = {
  guardado: "Cambios guardados.",
  revisado: "Marcada como revisada. Cuando agendes en Visoft, dala por gestionada.",
  corregido: "Dato corregido. El valor leído se conserva aparte.",
  alerta: "Alerta actualizada.",
  observacion: "Observaciones actualizadas.",
  tomada: "La solicitud ya está en tu bandeja.",
  devuelta: "La solicitud volvió a «Por tomar».",
};
const MENSAJES_ERROR: Record<string, string> = {
  dato: "Hay un dato no válido. Revisa el formulario.",
  documento: "El documento solo puede tener letras y números (4 a 20), sin puntos ni comas.",
  observacion: "La observación debe tener entre 1 y 500 caracteres.",
  guardar: "No se pudo guardar. Intenta de nuevo.",
  sin_revisar: "Antes de darla por gestionada, revisa los datos y pulsa «Revisado».",
  permiso: "No puedes modificar esta solicitud: no está asignada a ti. Tómala primero o pide que te la asignen.",
  cola: "No se pudo cambiar la asignación. Puede que otra persona la haya modificado; recarga la página.",
  cierre:
    "No se pudo cerrar la solicitud: la eliminación no se completó y los datos siguen intactos. Intenta de nuevo; si persiste, avisa al responsable del sistema.",
};

function Opciones({ mapa }: { mapa: Record<string, string> }) {
  return Object.entries(mapa).map(([valor, texto]) => (
    <option key={valor} value={valor}>
      {texto}
    </option>
  ));
}

function Selector({ nombre, titulo, mapa, valor }: { nombre: string; titulo: string; mapa: Record<string, string>; valor: string }) {
  return (
    <label className="block text-xs text-slate-500">
      {titulo}
      <select name={nombre} defaultValue={valor} className={`${claseCampo} mt-1`}>
        <Opciones mapa={mapa} />
      </select>
    </label>
  );
}

export default async function PaginaSolicitud({ params, searchParams }: PageProps<"/solicitudes/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { supabase, user, operador } = await requerirSesion();
  if (!operador) return null;
  const admin = esAdmin(operador.rol);

  const [solicitud, campos, alertas, observaciones, historial, trabajos] = await Promise.all([
    supabase.from("lista_espera").select("*").eq("id", id).maybeSingle(),
    supabase.from("campos_extraidos").select("*").eq("solicitud_id", id).order("id"),
    supabase.from("alertas").select("*").eq("solicitud_id", id).order("resuelta").order("id"),
    supabase.from("observaciones").select("*").eq("solicitud_id", id).order("id", { ascending: false }),
    supabase.from("historial_estados").select("*").eq("solicitud_id", id).order("id", { ascending: false }),
    supabase.from("trabajos_ocr").select("*").eq("solicitud_id", id).order("id"),
  ]);
  const s = solicitud.data as FilaLista | null;
  if (!s) notFound();
  // Solo se edita lo que está asignado a uno (o siendo administrador). La base lo exige también (RLS).
  const puedeEditar = admin || s.asignado_a === user.id;
  const [{ data: operadores }, { data: agenda }, { data: ips }, { data: lineamientos }, { data: bandeja }] = await Promise.all([
    admin
      ? supabase.from("operadores").select("user_id, nombre").eq("activo", true).order("nombre")
      : Promise.resolve({ data: [] as { user_id: string; nombre: string }[] }),
    supabase.from("solicitudes").select("ultima_asistencia, servicio_cita:servicios_cita(*)").eq("id", id).maybeSingle(),
    supabase.from("ips_sos").select("*"),
    supabase.from("lineamientos_generales").select("*"),
    // Anterior / siguiente dentro de mi bandeja (mismo orden que la lista: la más antigua primero).
    s.asignado_a === user.id
      ? supabase.from("lista_espera").select("id").eq("asignado_a", user.id).order("creada_en", { ascending: true }).limit(500)
      : Promise.resolve({ data: null as { id: string }[] | null }),
  ]);
  const servicioCita = (agenda?.servicio_cita ?? null) as unknown as ServicioCita | null;
  const ultimaAsistencia = (agenda as { ultima_asistencia?: string | null } | null)?.ultima_asistencia ?? null;
  const aVerificar = verificaciones({
    servicio: servicioCita,
    eps: s.eps,
    edad: s.edad,
    autorizacionEstado: s.autorizacion_estado,
    lineamientos: (lineamientos ?? []) as Lineamiento[],
    ips: (ips ?? []) as IpsSos[],
  });
  const faltantes = requisitos({ ...s, ultima_asistencia: ultimaAsistencia }, servicioCita, new Date().toISOString());
  const editables = documentosEditables(servicioCita, s.eps);
  const clase = servicioCita ? claseServicio(servicioCita) : null;
  const revisada = s.revision_humana === "COMPLETADA";
  const posicion = bandeja ? bandeja.findIndex((b) => b.id === s.id) : -1;
  const anterior = bandeja && posicion > 0 ? bandeja[posicion - 1].id : null;
  const siguiente = bandeja && posicion >= 0 && posicion < bandeja.length - 1 ? bandeja[posicion + 1].id : null;

  const ok = typeof sp.ok === "string" ? MENSAJES_OK[sp.ok] : sp.aviso === "asignada" ? "Solicitud asignada." : undefined;
  const fallo = typeof sp.error === "string" ? MENSAJES_ERROR[sp.error] : sp.aviso === "error" ? MENSAJES_ERROR.cola : undefined;
  const alertasAbiertas = (alertas.data ?? []).filter((a) => !a.resuelta);
  const pendientes = faltantes.filter((f) => f.estado !== "RECIBIDO").length;

  return (
    <div className="space-y-5">
      <Notificaciones
        avisos={[...(ok ? [{ tono: "ok" as const, texto: ok }] : []), ...(fallo ? [{ tono: "error" as const, texto: fallo }] : [])]}
      />

      {/* Encabezado: quién es, qué pide y en qué va. */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="cifras font-medium text-slate-500">{codigoSolicitud(s.numero)}</span>
            <Insignia tono={tonoEstado(s.estado)}>{etiqueta(ESTADOS, s.estado)}</Insignia>
            {revisada ? <Insignia tono="ok">Revisada</Insignia> : null}
            {clase ? <Insignia tono="info">{NOMBRE_CLASE[clase]}</Insignia> : null}
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-balance text-slate-900">{s.nombre ?? "Sin nombre aún"}</h1>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-slate-600">
            <span className="cifras">{s.documento ?? "Sin documento"}</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span>{s.eps === "OTRA" ? (s.eps_texto ?? "Otra EPS") : etiqueta(EPS, s.eps)}</span>
            {s.edad != null ? (
              <>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span className="cifras">{s.edad} años</span>
              </>
            ) : null}
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span>{s.servicio_texto ?? "Servicio sin definir"}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            En espera desde el {fecha(s.creada_en)} ({s.dias_espera} {s.dias_espera === 1 ? "día" : "días"}) · Última interacción{" "}
            {fechaHora(s.ultima_interaccion)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {bandeja && posicion >= 0 ? (
            <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white" role="group" aria-label="Moverse en tu bandeja">
              <NavBandeja id={anterior} texto="Anterior" icono="anterior" />
              <span className="cifras border-x border-slate-200 px-2.5 text-xs text-slate-500">
                {posicion + 1} de {bandeja.length}
              </span>
              <NavBandeja id={siguiente} texto="Siguiente" icono="siguiente" />
            </div>
          ) : null}
          {!s.asignado_a ? (
            <form action={tomarSolicitud.bind(null, s.id)}>
              <button type="submit" className={claseBoton}>
                Tomar esta solicitud
              </button>
            </form>
          ) : null}
        </div>
      </header>

      {/* Asignación: una línea, con sus acciones. */}
      <section
        aria-label="Asignación"
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm ${
          puedeEditar ? "bg-teal-50 text-teal-900" : "bg-amber-50 text-amber-900"
        }`}
      >
        <p>
          {s.asignado_a === user.id ? (
            <>En tu bandeja desde {fechaHora(s.fecha_asignacion)}.</>
          ) : s.asignado_a ? (
            <>
              {puedeEditar ? null : <strong>Solo lectura. </strong>}
              La gestiona <strong>{s.asignado_nombre ?? "otra persona"}</strong> desde {fechaHora(s.fecha_asignacion)}.
            </>
          ) : (
            <>
              {puedeEditar ? null : <strong>Solo lectura. </strong>}
              Sin asignar: está en «Por tomar».
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {s.asignado_a && (s.asignado_a === user.id || admin) ? (
            <form action={devolverSolicitud.bind(null, s.id, "ficha")}>
              <button type="submit" className="text-sm font-medium underline-offset-2 hover:underline">
                {s.asignado_a === user.id ? "Devolver a «Por tomar»" : "Liberar"}
              </button>
            </form>
          ) : null}
          {admin ? (
            <form action={asignarSolicitud.bind(null, s.id, `/solicitudes/${s.id}`)} className="flex gap-1">
              <select
                name="usuario"
                required
                defaultValue=""
                aria-label="Asignar a"
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
              >
                <option value="" disabled>
                  {s.asignado_a ? "Reasignar a…" : "Asignar a…"}
                </option>
                {(operadores ?? [])
                  .filter((o) => o.user_id !== s.asignado_a)
                  .map((o) => (
                    <option key={o.user_id} value={o.user_id}>
                      {o.nombre}
                    </option>
                  ))}
              </select>
              <button type="submit" className={`${claseBotonSecundario} py-1.5`}>
                Asignar
              </button>
            </form>
          ) : null}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          {/* Lo que falta primero: solo los documentos que aplican a este tipo de solicitud. */}
          <Tarjeta
            titulo={pendientes ? `Qué falta (${pendientes})` : "Documentos completos"}
            accion={clase ? <span className="text-xs text-slate-500">{NOMBRE_CLASE[clase]}</span> : null}
          >
            <ul className="divide-y divide-slate-100">
              {faltantes.map((f) => (
                <li key={f.clave} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <MarcaRequisito estado={f.estado} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{f.titulo}</p>
                    <p className="text-sm text-slate-600">{f.detalle}</p>
                  </div>
                  <span className={`text-xs font-medium ${COLOR_REQUISITO[f.estado]}`}>{TEXTO_REQUISITO[f.estado]}</span>
                </li>
              ))}
            </ul>
            {s.orden_vencimiento ? (
              <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">
                La orden vence el <span className="cifras font-medium text-slate-900">{fecha(s.orden_vencimiento)}</span>
                {s.orden_vencimiento_confianza === "BAJA" ? <span className="text-amber-700"> · fecha leída con baja confianza, verifícala</span> : null}
              </p>
            ) : null}
          </Tarjeta>

          {(alertas.data ?? []).length ? (
            <Tarjeta titulo={alertasAbiertas.length ? `Alertas (${alertasAbiertas.length})` : "Alertas revisadas"}>
              <ul className="space-y-2.5">
                {(alertas.data ?? []).map((a) => (
                  <li key={a.id} className={`rounded-lg px-3.5 py-3 ${a.resuelta ? "bg-slate-50" : "bg-amber-50"}`}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 flex-1 gap-2.5">
                        <Icono nombre="alerta" className={`mt-0.5 size-4 shrink-0 ${a.resuelta ? "text-slate-400" : "text-amber-600"}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900" title={a.codigo}>
                            {a.codigo.charAt(0) + a.codigo.slice(1).replaceAll("_", " ").toLowerCase()}
                          </p>
                          <p className={`mt-0.5 text-sm ${a.resuelta ? "text-slate-500 line-through" : "text-slate-700"}`}>{a.detalle}</p>
                        </div>
                      </div>
                      {puedeEditar ? (
                        <form action={marcarAlerta.bind(null, s.id, a.id, !a.resuelta)}>
                          <button type="submit" className="min-h-8 text-sm font-medium text-slate-700 underline-offset-2 hover:underline">
                            {a.resuelta ? "Reabrir" : "Marcar revisada"}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          ) : null}

          {aVerificar.length ? (
            <Tarjeta titulo="A verificar al agendar">
              <ul className="space-y-2.5">
                {aVerificar.map((v, i) => (
                  <li key={i} className="flex gap-2.5 text-sm">
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${
                        v.nivel === "alerta" ? "bg-rose-500" : v.nivel === "aviso" ? "bg-amber-500" : "bg-sky-500"
                      }`}
                    />
                    <span>
                      <span className="font-medium text-slate-900">{v.titulo}.</span> <span className="text-slate-600">{v.texto}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          ) : null}

          <Tarjeta titulo="Datos de la solicitud">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Dato nombre="Teléfono (WhatsApp)">
                <span className="cifras">{s.telefono ?? "—"}</span>
              </Dato>
              <Dato nombre="Servicio en Visoft">{servicioCita?.nombre_visoft ?? s.servicio_texto ?? "—"}</Dato>
              <Dato nombre="Especialidad probable">
                {etiqueta(CATEGORIAS, s.categoria_probable)}
                {s.clasificacion_confianza ? <span className="text-slate-500"> · confianza {s.clasificacion_confianza.toLowerCase()}</span> : null}
              </Dato>
              <Dato nombre="Motivo de la clasificación">{s.clasificacion_motivo ?? "—"}</Dato>
              <Dato nombre="Preferencia de horario">{s.preferencia_horario ?? "Sin preferencia"}</Dato>
              {clase === "TERAPIA" ? <Dato nombre="Última asistencia">{ultimaAsistencia ? fecha(ultimaAsistencia) : "—"}</Dato> : null}
              <Dato nombre="Condiciones declaradas">
                {s.factores.length ? (
                  <span className="flex flex-wrap gap-1">
                    {s.factores.map((x) => (
                      <Insignia key={x} tono="info">
                        {etiqueta(FACTORES, x)}
                      </Insignia>
                    ))}
                  </span>
                ) : (
                  "Ninguna"
                )}
              </Dato>
              <Dato nombre="Otras solicitudes del mismo documento">
                {s.solicitudes_mismo_documento > 1 ? <Insignia tono="aviso">{s.solicitudes_mismo_documento - 1}</Insignia> : "Ninguna"}
              </Dato>
            </dl>
          </Tarjeta>

          <Plegable
            titulo="Datos leídos de los documentos"
            cuenta={(campos.data ?? []).length}
            abierto={(campos.data ?? []).some((c) => c.verificacion === "DISCREPANCIA")}
          >
            {(campos.data ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">Todavía no hay datos leídos. Aparecen cuando el lector procesa los documentos.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Campo</th>
                      <th className="py-2 pr-4 font-medium">Leído</th>
                      <th className="py-2 pr-4 font-medium">Comparación</th>
                      <th className="py-2 font-medium">Corrección</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(campos.data ?? []).map((c) => (
                      <tr key={c.id}>
                        <td className="py-2.5 pr-4 align-top">
                          {etiqueta(CAMPOS, c.campo)}
                          <div className="text-xs text-slate-500">{etiqueta(ORIGENES, c.origen)}</div>
                        </td>
                        <td className="cifras py-2.5 pr-4 align-top text-xs">
                          {c.valor_ocr ?? "—"}
                          {c.confianza === "BAJA" ? <div className="text-amber-700">baja confianza</div> : null}
                        </td>
                        <td className="py-2.5 pr-4 align-top">
                          <Insignia
                            tono={
                              c.verificacion === "DISCREPANCIA"
                                ? "peligro"
                                : c.verificacion === "COINCIDE" || c.verificacion === "CORREGIDO_HUMANO"
                                  ? "ok"
                                  : "neutro"
                            }
                          >
                            {etiqueta(VERIFICACION, c.verificacion)}
                          </Insignia>
                        </td>
                        <td className="py-2.5 align-top">
                          {puedeEditar ? (
                            <form action={corregirCampo.bind(null, s.id, c.id)} className="flex gap-2">
                              <input
                                name="valor_corregido"
                                defaultValue={c.valor_corregido ?? ""}
                                placeholder="Valor correcto"
                                aria-label={`Corregir ${etiqueta(CAMPOS, c.campo)}`}
                                maxLength={200}
                                className={claseCampo}
                              />
                              <button type="submit" className={claseBotonSecundario}>
                                Corregir
                              </button>
                            </form>
                          ) : (
                            <span className="cifras text-xs">{c.valor_corregido ?? "—"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-slate-500">Las imágenes no se guardan en este sistema: los originales están en el chat de WhatsApp.</p>
          </Plegable>

          <Plegable titulo="Documentos procesados" cuenta={(trabajos.data ?? []).length}>
            {(trabajos.data ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">El paciente todavía no ha enviado documentos.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {(trabajos.data ?? []).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <span>
                      {etiqueta(ORIGENES, t.tipo_documento)}
                      {t.pagina_total ? (
                        <span className="cifras text-slate-500">
                          {" "}
                          · pág. {t.pagina_actual} de {t.pagina_total}
                        </span>
                      ) : null}
                    </span>
                    <Insignia tono={t.legibilidad === "LEGIBLE" ? "ok" : t.legibilidad ? "peligro" : "neutro"}>
                      {t.legibilidad === "LEGIBLE" ? "Legible" : t.legibilidad === "ILEGIBLE" ? "Ilegible" : t.estado.toLowerCase()}
                    </Insignia>
                  </li>
                ))}
              </ul>
            )}
          </Plegable>

          {(historial.data ?? []).length > 0 ? (
            <Plegable titulo="Historial de estados" cuenta={(historial.data ?? []).length}>
              <ul className="space-y-2 text-sm">
                {(historial.data ?? []).map((h) => (
                  <li key={h.id}>
                    <span className="text-slate-900">{etiqueta(ESTADOS, h.estado_nuevo)}</span>
                    <span className="cifras text-xs text-slate-500"> · {fechaHora(h.cambiado_en)}</span>
                  </li>
                ))}
              </ul>
            </Plegable>
          ) : null}
        </div>

        {/* Columna de trabajo: revisar, gestionar y anotar. */}
        <div className="space-y-5">
          {puedeEditar ? (
            <>
              <Tarjeta titulo="Revisión">
                <form action={guardarGestion.bind(null, s.id)} className="space-y-3">
                  <input type="hidden" name="revision_humana" value="COMPLETADA" />
                  <div className="grid grid-cols-2 gap-3">
                    <Selector nombre="eps" titulo="EPS" mapa={EPS} valor={s.eps} />
                    <Selector nombre="estado" titulo="Estado" mapa={ESTADOS} valor={s.estado} />
                  </div>
                  <label className="block text-xs text-slate-500">
                    Nombre completo
                    <input name="nombre" defaultValue={s.nombre ?? ""} maxLength={120} className={`${claseCampo} mt-1`} />
                  </label>
                  <label className="block text-xs text-slate-500">
                    Documento (sin puntos ni comas)
                    <input name="documento" defaultValue={s.documento ?? ""} pattern="[0-9A-Za-z]{4,20}" className={`${claseCampo} cifras mt-1`} />
                  </label>
                  <Selector nombre="categoria_probable" titulo="Especialidad" mapa={CATEGORIAS} valor={s.categoria_probable} />
                  <fieldset className="space-y-3 border-t border-slate-100 pt-3">
                    <legend className="mb-2 pt-3 text-xs font-medium text-slate-700">Documentos</legend>
                    {editables.orden ? <Selector nombre="orden_estado" titulo="Orden" mapa={ORDEN_ESTADO} valor={s.orden_estado} /> : null}
                    {editables.historia ? <Selector nombre="historia_estado" titulo="Historia clínica" mapa={HISTORIA_ESTADO} valor={s.historia_estado} /> : null}
                    {editables.autorizacion ? (
                      <Selector
                        nombre="autorizacion_estado"
                        titulo={s.eps === "SOS" ? "OPS" : "Autorización"}
                        mapa={AUTORIZACION_ESTADO}
                        valor={s.autorizacion_estado}
                      />
                    ) : null}
                    {editables.plan ? <Selector nombre="plan_estado" titulo="Plan de tratamiento" mapa={PLAN_ESTADO} valor={s.plan_estado} /> : null}
                    {editables.ultimaAsistencia ? (
                      <label className="block text-xs text-slate-500">
                        Última asistencia a terapia
                        <input type="date" name="ultima_asistencia" defaultValue={ultimaAsistencia ?? ""} className={`${claseCampo} mt-1`} />
                      </label>
                    ) : null}
                    <label className="block text-xs text-slate-500">
                      Fecha de la cita asignada en Visoft
                      <input type="date" name="cita_previa_fecha" defaultValue={s.cita_previa_fecha ?? ""} className={`${claseCampo} mt-1`} />
                    </label>
                  </fieldset>
                  <button type="submit" className={`${claseBoton} w-full gap-2`}>
                    <Icono nombre="check" className="size-4" />
                    Revisado
                  </button>
                  <p className="text-xs text-slate-500">Guarda los cambios y confirma que revisaste la solicitud.</p>
                </form>
              </Tarjeta>

              <Tarjeta titulo="Gestionar">
                <p className="text-sm text-slate-600">
                  {revisada
                    ? "Cuando agendes en Visoft, márcala como gestionada. Sus datos se eliminan."
                    : "Primero pulsa «Revisado». Después podrás marcarla como gestionada."}
                </p>
                {revisada ? (
                  <details className="mt-3">
                    <summary className={`sin-marca cursor-pointer ${claseBoton} w-full`}>Marcar como gestionada…</summary>
                    <FormCierre id={s.id} motivos={["GESTIONADA", "CERRADA_DUPLICADA", "CERRADA_POR_USUARIO"]} />
                  </details>
                ) : (
                  <>
                    <button type="button" disabled className={`${claseBotonSecundario} mt-3 w-full cursor-not-allowed opacity-60`}>
                      Marcar como gestionada…
                    </button>
                    <details className="mt-2">
                      <summary className="sin-marca cursor-pointer text-xs text-slate-500 underline-offset-2 hover:underline">
                        ¿Es duplicada o el paciente desistió?
                      </summary>
                      <FormCierre id={s.id} motivos={["CERRADA_DUPLICADA", "CERRADA_POR_USUARIO"]} />
                    </details>
                  </>
                )}
              </Tarjeta>
            </>
          ) : null}

          <Tarjeta titulo="Observaciones">
            {puedeEditar ? (
              <form action={agregarObservacion.bind(null, s.id)} className="space-y-2">
                <textarea
                  name="texto"
                  required
                  maxLength={500}
                  rows={2}
                  placeholder="Nota breve para el equipo. No copies contenido de la historia clínica."
                  aria-label="Nueva observación"
                  className={claseCampo}
                />
                <button type="submit" className={claseBotonSecundario}>
                  Agregar
                </button>
              </form>
            ) : null}
            {(observaciones.data ?? []).length > 0 ? (
              <ul className="mt-3 divide-y divide-slate-100">
                {(observaciones.data ?? []).map((o) => (
                  <li key={o.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div>
                      <p className="text-sm whitespace-pre-wrap text-slate-900">{o.texto}</p>
                      <p className="cifras mt-0.5 text-xs text-slate-500">{fechaHora(o.creada_en)}</p>
                    </div>
                    {puedeEditar ? (
                      <form action={borrarObservacion.bind(null, s.id, o.id)}>
                        <button type="submit" className="text-xs text-slate-500 hover:text-rose-700 hover:underline">
                          Quitar
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : puedeEditar ? null : (
              <p className="text-sm text-slate-500">Sin observaciones.</p>
            )}
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}

const TEXTO_REQUISITO: Record<EstadoRequisito, string> = { RECIBIDO: "Listo", FALTA: "Falta", VERIFICAR: "Verificar" };
const COLOR_REQUISITO: Record<EstadoRequisito, string> = { RECIBIDO: "text-emerald-700", FALTA: "text-rose-700", VERIFICAR: "text-amber-700" };
const MOTIVOS: Record<string, string> = {
  GESTIONADA: "Gestionada (agendada en Visoft)",
  CERRADA_DUPLICADA: "Duplicada",
  CERRADA_POR_USUARIO: "El paciente desistió",
};

function FormCierre({ id, motivos }: { id: string; motivos: string[] }) {
  return (
    <form action={cerrarSolicitud.bind(null, id)} className="mt-3 space-y-3 rounded-lg bg-rose-50 p-4">
      <p className="text-sm font-medium text-rose-900">No se puede deshacer.</p>
      <p className="text-sm text-rose-900">
        Se eliminan los datos de esta solicitud: nombre, documento, teléfono, datos leídos, alertas y observaciones. Otras solicitudes del
        mismo paciente no se tocan.
      </p>
      <label className="block text-xs text-rose-900">
        Motivo
        <select name="motivo" defaultValue={motivos[0]} className={`${claseCampo} mt-1`}>
          {motivos.map((m) => (
            <option key={m} value={m}>
              {MOTIVOS[m]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="inline-flex w-full items-center justify-center rounded-lg bg-rose-700 px-3.5 py-2 text-sm font-medium text-white transition-[background-color,transform] duration-150 hover:bg-rose-800 active:scale-[0.97]"
      >
        Sí, cerrar y eliminar los datos
      </button>
    </form>
  );
}

function MarcaRequisito({ estado }: { estado: EstadoRequisito }) {
  const estilo =
    estado === "RECIBIDO" ? "bg-emerald-100 text-emerald-700" : estado === "FALTA" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700";
  return (
    <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${estilo}`}>
      <Icono nombre={estado === "RECIBIDO" ? "check" : estado === "FALTA" ? "falta" : "alerta"} className="size-3.5" />
    </span>
  );
}

function NavBandeja({ id, texto, icono }: { id: string | null; texto: string; icono: "anterior" | "siguiente" }) {
  const clase = "grid size-9 place-items-center transition-colors";
  return id ? (
    <Link href={`/solicitudes/${id}`} aria-label={`${texto} en tu bandeja`} title={texto} className={`${clase} text-slate-600 hover:bg-slate-50 hover:text-slate-900`}>
      <Icono nombre={icono} className="size-4" />
    </Link>
  ) : (
    <span aria-hidden="true" className={`${clase} text-slate-300`}>
      <Icono nombre={icono} className="size-4" />
    </span>
  );
}

function Plegable({ titulo, cuenta, abierto = false, children }: { titulo: string; cuenta: number; abierto?: boolean; children: ReactNode }) {
  return (
    <details open={abierto} className="group rounded-xl border border-slate-200/80 bg-white">
      <summary className="sin-marca flex cursor-pointer items-center justify-between gap-3 px-5 py-3">
        <span className="text-sm font-semibold text-slate-900">
          {titulo} <span className="cifras ml-1 font-normal text-slate-500">{cuenta}</span>
        </span>
        <Icono nombre="flecha" className="size-4 text-slate-400 transition-transform duration-150 group-open:rotate-90" />
      </summary>
      <div className="border-t border-slate-100 px-5 py-4">{children}</div>
    </details>
  );
}
