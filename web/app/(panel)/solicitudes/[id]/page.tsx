import Link from "next/link";
import { notFound } from "next/navigation";
import { Dato, Insignia, Tarjeta, claseBoton, claseBotonSecundario, claseCampo } from "@/app/componentes";
import {
  AUTORIZACION_ESTADO,
  CAMPOS,
  CATEGORIAS,
  EPS,
  ESTADOS,
  ESTADO_DOCUMENTAL,
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
  tonoEstadoDocumental,
  type FilaLista,
} from "@/lib/catalogo";
import type { ServicioCita } from "@/lib/horarios";
import { verificaciones, type IpsSos, type Lineamiento } from "@/lib/lineamientos";
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

const MENSAJES_OK: Record<string, string> = {
  guardado: "Cambios guardados.",
  corregido: "Dato corregido. El valor leído por OCR se conserva aparte.",
  alerta: "Alerta actualizada.",
  observacion: "Observaciones actualizadas.",
  tomada: "La solicitud ya está en tu cola de trabajo.",
  devuelta: "La solicitud volvió a la bolsa general.",
};
const MENSAJES_ERROR: Record<string, string> = {
  dato: "Hay un dato no válido. Revisa el formulario.",
  documento: "El documento solo puede tener letras y números (4 a 20), sin puntos ni comas.",
  observacion: "La observación debe tener entre 1 y 500 caracteres.",
  guardar: "No se pudo guardar. Intenta de nuevo.",
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

function Selector({
  nombre,
  titulo,
  mapa,
  valor,
}: {
  nombre: string;
  titulo: string;
  mapa: Record<string, string>;
  valor: string;
}) {
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
  const [{ data: operadores }, { data: agenda }, { data: ips }, { data: lineamientos }] = await Promise.all([
    admin
      ? supabase.from("operadores").select("user_id, nombre").eq("activo", true).order("nombre")
      : Promise.resolve({ data: [] as { user_id: string; nombre: string }[] }),
    supabase.from("solicitudes").select("servicio_cita:servicios_cita(*)").eq("id", id).maybeSingle(),
    supabase.from("ips_sos").select("*"),
    supabase.from("lineamientos_generales").select("*"),
  ]);
  const servicioCita = (agenda?.servicio_cita ?? null) as unknown as ServicioCita | null;
  const aVerificar = verificaciones({
    servicio: servicioCita,
    eps: s.eps,
    edad: s.edad,
    autorizacionEstado: s.autorizacion_estado,
    lineamientos: (lineamientos ?? []) as Lineamiento[],
    ips: (ips ?? []) as IpsSos[],
  });

  const ok = typeof sp.ok === "string" ? MENSAJES_OK[sp.ok] : sp.aviso === "asignada" ? "Solicitud asignada." : undefined;
  const fallo = typeof sp.error === "string" ? MENSAJES_ERROR[sp.error] : sp.aviso === "error" ? MENSAJES_ERROR.cola : undefined;

  return (
    <div className="space-y-5">
      <div>
        <Link href={s.asignado_a === user.id ? "/lista-espera?tab=mia" : "/lista-espera?tab=bolsa"} className="text-sm text-teal-700 hover:underline">
          ← Lista de espera
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-xl font-semibold text-slate-900">
            {codigoSolicitud(s.numero)} · {s.nombre ?? "Sin nombre aún"}
          </h1>
          <Insignia tono={tonoEstado(s.estado)}>{etiqueta(ESTADOS, s.estado)}</Insignia>
          <Insignia tono={tonoEstadoDocumental(s.estado_documental)}>
            Documentos: {etiqueta(ESTADO_DOCUMENTAL, s.estado_documental)}
          </Insignia>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          En espera desde el {fecha(s.creada_en)} ({s.dias_espera} {s.dias_espera === 1 ? "día" : "días"}) · Última
          interacción: {fechaHora(s.ultima_interaccion)}
        </p>
      </div>

      <Notificaciones
        avisos={[
          ...(ok ? [{ tono: "ok" as const, texto: ok }] : []),
          ...(fallo ? [{ tono: "error" as const, texto: fallo }] : []),
        ]}
      />

      <section
        aria-label="Asignación"
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
          puedeEditar ? "border-teal-200 bg-teal-50 text-teal-900" : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        <p>
          {s.asignado_a === user.id ? (
            <>
              <strong>En tu cola de trabajo</strong> desde {fechaHora(s.fecha_asignacion)}.
            </>
          ) : s.asignado_a ? (
            <>
              {puedeEditar ? null : <strong>Modo solo lectura. </strong>}
              La está gestionando <strong>{s.asignado_nombre ?? "otra persona"}</strong> desde {fechaHora(s.fecha_asignacion)}.
            </>
          ) : (
            <>
              {puedeEditar ? null : <strong>Modo solo lectura. </strong>}
              Está en la bolsa general, sin asignar.
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {!s.asignado_a ? (
            <form action={tomarSolicitud.bind(null, s.id)}>
              <button type="submit" className={claseBoton}>
                Tomar esta solicitud
              </button>
            </form>
          ) : null}
          {s.asignado_a && (s.asignado_a === user.id || admin) ? (
            <form action={devolverSolicitud.bind(null, s.id, "ficha")}>
              <button type="submit" className={claseBotonSecundario}>
                {s.asignado_a === user.id ? "Devolver a la bolsa" : "Liberar"}
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
                className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
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
              <button type="submit" className={claseBotonSecundario}>
                Asignar
              </button>
            </form>
          ) : null}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Tarjeta titulo={`Alertas (${(alertas.data ?? []).filter((a) => !a.resuelta).length} abiertas)`}>
            {(alertas.data ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">Sin alertas para esta solicitud.</p>
            ) : (
              <ul className="space-y-3">
                {(alertas.data ?? []).map((a) => (
                  <li
                    key={a.id}
                    className={`rounded-lg border px-4 py-3 ${a.resuelta ? "border-slate-200 bg-slate-50" : "border-amber-200 bg-amber-50"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs text-slate-500">{a.codigo}</p>
                        <p className={`mt-1 text-sm ${a.resuelta ? "text-slate-500 line-through" : "text-slate-900"}`}>
                          {a.detalle}
                        </p>
                      </div>
                      {puedeEditar ? (
                        <form action={marcarAlerta.bind(null, s.id, a.id, !a.resuelta)}>
                          <button type="submit" className={claseBotonSecundario}>
                            {a.resuelta ? "Reabrir" : "Marcar revisada"}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

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
                      <span className="font-medium text-slate-900">{v.titulo}.</span>{" "}
                      <span className="text-slate-600">{v.texto}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-500">Se configura en Agendas → Reglas y lineamientos.</p>
            </Tarjeta>
          ) : null}

          <Tarjeta titulo="Datos de la solicitud">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Dato nombre="Documento">
                <span className="font-mono">{s.documento ?? "—"}</span>
              </Dato>
              <Dato nombre="Teléfono (WhatsApp)">
                <span className="font-mono">{s.telefono ?? "—"}</span>
              </Dato>
              <Dato nombre="Edad declarada">{s.edad ?? "—"}</Dato>
              <Dato nombre="EPS">
                {etiqueta(EPS, s.eps)}
                {s.eps_texto ? <span className="text-slate-500"> · escribió “{s.eps_texto}”</span> : null}
              </Dato>
              <Dato nombre="Servicio solicitado">
                {s.servicio_texto ?? "—"}
                {servicioCita?.nombre_visoft ? (
                  <span className="block text-xs text-slate-500">Visoft: {servicioCita.nombre_visoft}</span>
                ) : null}
              </Dato>
              <Dato nombre="Especialidad probable">
                {etiqueta(CATEGORIAS, s.categoria_probable)}
                {s.clasificacion_confianza ? (
                  <span className="text-slate-500"> · confianza {s.clasificacion_confianza.toLowerCase()}</span>
                ) : null}
              </Dato>
              <Dato nombre="Motivo de la clasificación">{s.clasificacion_motivo ?? "—"}</Dato>
              <Dato nombre="¿Terapia previa para este diagnóstico?">
                {s.terapia_previa === "SI" ? "Sí" : s.terapia_previa === "NO" ? "No" : s.terapia_previa === "NO_SABE" ? "No sabe" : "—"}
              </Dato>
              <Dato nombre="Preferencia de horario (no es reserva)">{s.preferencia_horario ?? "—"}</Dato>
              <Dato nombre="Orden vence">
                {s.orden_vencimiento ? (
                  <>
                    {fecha(s.orden_vencimiento)}
                    {s.orden_vencimiento_confianza === "BAJA" ? (
                      <span className="text-amber-700"> · fecha leída con baja confianza, verificar</span>
                    ) : null}
                  </>
                ) : (
                  "Sin fecha confirmada"
                )}
              </Dato>
              <Dato nombre="Condiciones declaradas">
                {s.factores.length ? (
                  <span className="flex flex-wrap gap-1">
                    {s.factores.map((x) => (
                      <Insignia key={x} tono="info">
                        {etiqueta(FACTORES, x)}
                      </Insignia>
                    ))}
                    {s.factores_origen ? (
                      <span className="text-xs text-slate-500">({s.factores_origen.toLowerCase()})</span>
                    ) : null}
                  </span>
                ) : (
                  "—"
                )}
              </Dato>
              <Dato nombre="Otras solicitudes activas del mismo documento">
                {s.solicitudes_mismo_documento > 1 ? (
                  <Insignia tono="aviso">{s.solicitudes_mismo_documento - 1}</Insignia>
                ) : (
                  "Ninguna"
                )}
              </Dato>
            </dl>
          </Tarjeta>

          <Tarjeta titulo="Datos leídos de los documentos (OCR)">
            {(campos.data ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">Todavía no hay datos extraídos.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Campo</th>
                      <th className="py-2 pr-4 font-medium">Leído por OCR</th>
                      <th className="py-2 pr-4 font-medium">Comparación</th>
                      <th className="py-2 font-medium">Corrección humana</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(campos.data ?? []).map((c) => (
                      <tr key={c.id}>
                        <td className="py-2.5 pr-4 align-top">
                          {etiqueta(CAMPOS, c.campo)}
                          <div className="text-xs text-slate-500">{etiqueta(ORIGENES, c.origen)}</div>
                        </td>
                        <td className="py-2.5 pr-4 align-top font-mono text-xs">
                          {c.valor_ocr ?? "—"}
                          {c.confianza === "BAJA" ? <div className="font-sans text-amber-700">baja confianza</div> : null}
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
                              Guardar
                            </button>
                          </form>
                          ) : (
                            <span className="font-mono text-xs">{c.valor_corregido ?? "—"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Las imágenes no se guardan en este sistema. Revisa los documentos originales en el chat de WhatsApp.
            </p>
          </Tarjeta>

          <Tarjeta titulo="Observaciones">
            {puedeEditar ? (
            <form action={agregarObservacion.bind(null, s.id)} className="space-y-2">
              <textarea
                name="texto"
                required
                maxLength={500}
                rows={2}
                placeholder="Nota operativa breve. No copies contenido de la historia clínica."
                aria-label="Nueva observación"
                className={claseCampo}
              />
              <button type="submit" className={claseBotonSecundario}>
                Agregar observación
              </button>
            </form>
            ) : null}
            {(observaciones.data ?? []).length > 0 ? (
              <ul className="mt-4 divide-y divide-slate-100">
                {(observaciones.data ?? []).map((o) => (
                  <li key={o.id} className="flex items-start justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm whitespace-pre-wrap text-slate-900">{o.texto}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{fechaHora(o.creada_en)}</p>
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
            ) : null}
          </Tarjeta>
        </div>

        <div className="space-y-5">
          {puedeEditar ? (
          <>
          <Tarjeta titulo="Gestión">
            <form action={guardarGestion.bind(null, s.id)} className="space-y-3">
              <Selector nombre="estado" titulo="Estado de la solicitud" mapa={ESTADOS} valor={s.estado} />
              <label className="block text-xs text-slate-500">
                Revisión humana
                <select name="revision_humana" defaultValue={s.revision_humana} className={`${claseCampo} mt-1`}>
                  <option value="PENDIENTE">Pendiente</option>
                  <option value="COMPLETADA">Completada</option>
                </select>
              </label>
              <Selector nombre="categoria_probable" titulo="Especialidad" mapa={CATEGORIAS} valor={s.categoria_probable} />
              <Selector nombre="eps" titulo="EPS" mapa={EPS} valor={s.eps} />
              <label className="block text-xs text-slate-500">
                Nombre
                <input name="nombre" defaultValue={s.nombre ?? ""} maxLength={120} className={`${claseCampo} mt-1`} />
              </label>
              <label className="block text-xs text-slate-500">
                Documento (sin puntos ni comas)
                <input
                  name="documento"
                  defaultValue={s.documento ?? ""}
                  pattern="[0-9A-Za-z]{4,20}"
                  className={`${claseCampo} mt-1 font-mono`}
                />
              </label>
              <hr className="border-slate-200" />
              <Selector nombre="orden_estado" titulo="Orden" mapa={ORDEN_ESTADO} valor={s.orden_estado} />
              <Selector nombre="historia_estado" titulo="Historia clínica" mapa={HISTORIA_ESTADO} valor={s.historia_estado} />
              <Selector nombre="plan_estado" titulo="Plan de tratamiento" mapa={PLAN_ESTADO} valor={s.plan_estado} />
              <Selector
                nombre="autorizacion_estado"
                titulo="Autorización / OPS"
                mapa={AUTORIZACION_ESTADO}
                valor={s.autorizacion_estado}
              />
              <label className="block text-xs text-slate-500">
                Fecha de la última cita asignada (registro manual)
                <input
                  type="date"
                  name="cita_previa_fecha"
                  defaultValue={s.cita_previa_fecha ?? ""}
                  className={`${claseCampo} mt-1`}
                />
              </label>
              <button type="submit" className={`${claseBoton} w-full`}>
                Guardar cambios
              </button>
            </form>
          </Tarjeta>

          <Tarjeta titulo="Cerrar solicitud">
            <p className="text-sm text-slate-600">
              Úsalo cuando termines la gestión (por ejemplo, después de agendar en Visoft).
            </p>
            <details className="mt-3">
              <summary className={`sin-marca cursor-pointer ${claseBoton} w-full`}>Marcar como GESTIONADA…</summary>
              <form
                action={cerrarSolicitud.bind(null, s.id)}
                className="mt-3 space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-4"
              >
                <p className="text-sm font-medium text-rose-900">Esta acción no se puede deshacer.</p>
                <p className="text-sm text-rose-900">
                  Se eliminarán de forma permanente los datos de esta solicitud: nombre, documento, teléfono, datos
                  leídos por OCR, alertas y observaciones. Otras solicitudes del mismo paciente no se tocan.
                </p>
                <label className="block text-xs text-rose-900">
                  Motivo
                  <select name="motivo" defaultValue="GESTIONADA" className={`${claseCampo} mt-1`}>
                    <option value="GESTIONADA">Gestionada</option>
                    <option value="CERRADA_DUPLICADA">Duplicada</option>
                    <option value="CERRADA_POR_USUARIO">El paciente desistió</option>
                  </select>
                </label>
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-lg bg-rose-700 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-800 active:scale-[0.98]"
                >
                  Sí, cerrar y eliminar los datos
                </button>
              </form>
            </details>
          </Tarjeta>

          </>
          ) : null}

          <Tarjeta titulo="Documentos procesados">
            {(trabajos.data ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">Ningún documento procesado.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {(trabajos.data ?? []).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <span>
                      {etiqueta(ORIGENES, t.tipo_documento)}
                      {t.pagina_total ? (
                        <span className="text-slate-500">
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
          </Tarjeta>

          {(historial.data ?? []).length > 0 ? (
            <Tarjeta titulo="Historial de estados">
              <ul className="space-y-2 text-sm">
                {(historial.data ?? []).map((h) => (
                  <li key={h.id}>
                    <span className="text-slate-900">{etiqueta(ESTADOS, h.estado_nuevo)}</span>
                    <span className="text-xs text-slate-500"> · {fechaHora(h.cambiado_en)}</span>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          ) : null}
        </div>
      </div>
    </div>
  );
}
