import Link from "next/link";
import { Insignia, claseBoton, claseBotonSecundario, claseCampo } from "@/app/componentes";
import {
  CATEGORIAS,
  EPS,
  ESTADOS,
  ESTADO_DOCUMENTAL,
  FACTORES,
  codigoSolicitud,
  documentoOculto,
  esValor,
  etiqueta,
  fecha,
  textoBusqueda,
  tonoEstado,
  tonoEstadoDocumental,
  type FilaLista,
} from "@/lib/catalogo";
import { esAdmin } from "@/lib/roles";
import { requerirSesion } from "@/lib/supabase/server";
import { Notificaciones, type Aviso } from "@/components/Notificaciones";
import { BuscadorLocal } from "../buscador-local";
import { asignarSolicitud, devolverSolicitud, tomarSolicitud } from "./actions";
import { FiltrosPlegables } from "./filtros-plegables";
import { ModalTomar } from "./modal-tomar";

type Pestana = "mia" | "bolsa" | "otros";

const AVISOS: Record<string, Aviso> = {
  tomada: { tono: "error", texto: "Otra persona tomó esa solicitud antes que tú. Elige otra de la bolsa." },
  devuelta: { tono: "ok", texto: "La solicitud volvió a la bolsa general." },
  asignada: { tono: "ok", texto: "Solicitud asignada." },
  error: { tono: "error", texto: "No se pudo completar la acción. Intenta de nuevo." },
};

function uno(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function Opciones({ mapa }: { mapa: Record<string, string> }) {
  return Object.entries(mapa).map(([valor, texto]) => (
    <option key={valor} value={valor}>
      {texto}
    </option>
  ));
}

function Vence({ dias, confianza, largo = false }: { dias: number | null; confianza: string | null; largo?: boolean }) {
  if (dias === null) return <span className="text-slate-400">Sin fecha</span>;
  const dudosa = confianza === "BAJA";
  const texto = largo
    ? dias < 0
      ? `Orden vencida hace ${-dias} d`
      : dias === 0
        ? "Orden vence hoy"
        : `Orden vence en ${dias} d`
    : dias < 0
      ? `Hace ${-dias} d`
      : dias === 0
        ? "Hoy"
        : `${dias} d`;
  const tono = dudosa ? "neutro" : dias <= 3 ? "peligro" : dias <= 7 ? "aviso" : "neutro";
  return (
    <Insignia tono={tono}>
      {texto}
      {dudosa ? " · fecha dudosa" : ""}
    </Insignia>
  );
}

export default async function PaginaListaEspera({ searchParams }: PageProps<"/lista-espera">) {
  const sp = await searchParams;
  const { supabase, user, operador } = await requerirSesion();
  if (!operador) return null;
  const admin = esAdmin(operador.rol);

  const pestana: Pestana = uno(sp.tab) === "bolsa" ? "bolsa" : uno(sp.tab) === "otros" && admin ? "otros" : "mia";

  // La búsqueda por nombre o documento es local (BuscadorLocal): nunca llega a la URL.
  const f = {
    eps: uno(sp.eps),
    cat: uno(sp.cat),
    estado: uno(sp.estado),
    doc: uno(sp.doc),
    factor: uno(sp.factor),
    alerta: uno(sp.alerta) === "1",
    vence: uno(sp.vence) === "7",
    orden: uno(sp.orden) === "vencimiento" ? "vencimiento" : "espera",
  };

  let consulta = supabase.from("lista_espera").select("*");
  if (pestana === "mia") consulta = consulta.eq("asignado_a", user.id);
  else if (pestana === "bolsa") consulta = consulta.is("asignado_a", null);
  else consulta = consulta.not("asignado_a", "is", null).neq("asignado_a", user.id);
  if (esValor(EPS, f.eps)) consulta = consulta.eq("eps", f.eps);
  if (esValor(CATEGORIAS, f.cat)) consulta = consulta.eq("categoria_probable", f.cat);
  if (esValor(ESTADOS, f.estado)) consulta = consulta.eq("estado", f.estado);
  if (esValor(ESTADO_DOCUMENTAL, f.doc)) consulta = consulta.eq("estado_documental", f.doc);
  if (esValor(FACTORES, f.factor)) consulta = consulta.contains("factores", [f.factor]);
  if (f.alerta) consulta = consulta.gt("alertas_abiertas", 0);
  if (f.vence) consulta = consulta.lte("dias_para_vencer", 7);
  consulta =
    f.orden === "vencimiento"
      ? consulta.order("orden_vencimiento", { ascending: true, nullsFirst: false })
      : consulta.order("creada_en", { ascending: true });

  const [{ data, error }, { data: conteo }, { data: operadores }] = await Promise.all([
    consulta.limit(500),
    supabase.from("solicitudes").select("asignado_a"),
    admin
      ? supabase.from("operadores").select("user_id, nombre").eq("activo", true).order("nombre")
      : Promise.resolve({ data: [] as { user_id: string; nombre: string }[] }),
  ]);
  const filas = (data ?? []) as FilaLista[];
  const todos = conteo ?? [];
  const cuentas = {
    mia: todos.filter((c) => c.asignado_a === user.id).length,
    bolsa: todos.filter((c) => c.asignado_a === null).length,
    otros: todos.filter((c) => c.asignado_a !== null && c.asignado_a !== user.id).length,
  };

  const hayFiltros = Boolean(
    f.eps || f.cat || f.estado || f.doc || f.factor || f.alerta || f.vence || f.orden !== "espera",
  );
  const cerrada = uno(sp.cerrada);
  const aviso = AVISOS[uno(sp.aviso) ?? ""];
  const volverA = `/lista-espera?tab=${pestana}`;
  const avisos: Aviso[] = [
    ...(cerrada ? [{ tono: "ok" as const, texto: "Solicitud cerrada. Sus datos se eliminaron y se verificó que no quedó ningún registro asociado." }] : []),
    ...(aviso ? [aviso] : []),
  ];

  const pestanas: { id: Pestana; texto: string; total: number }[] = [
    { id: "mia", texto: "Mi cola de trabajo", total: cuentas.mia },
    { id: "bolsa", texto: "Bolsa general de espera", total: cuentas.bolsa },
    ...(admin ? [{ id: "otros" as const, texto: "En gestión por otros", total: cuentas.otros }] : []),
  ];

  const filtrosActivos = [f.eps, f.cat, f.estado, f.doc, f.factor, f.alerta, f.vence, f.orden !== "espera"].filter(Boolean).length;
  const accionTitulo = pestana === "otros" ? "Asignada a" : pestana === "mia" ? "Acción" : admin ? "Asignar a" : "";

  /** Acciones de la fila (devolver, asignar, liberar). Se usan igual en la tabla y en las tarjetas. */
  const acciones = (s: FilaLista, codigo: string, ancho: string) => (
    <>
      {pestana === "mia" ? (
        <form action={devolverSolicitud.bind(null, s.id, volverA)}>
          <button type="submit" className="min-h-8 text-xs font-medium text-slate-600 hover:text-rose-700 hover:underline">
            Devolver a la bolsa
          </button>
        </form>
      ) : null}
      {pestana === "otros" ? <div className="mb-1.5 text-xs text-slate-700">{s.asignado_nombre ?? "—"}</div> : null}
      {admin && pestana !== "mia" ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <form action={asignarSolicitud.bind(null, s.id, volverA)} className="flex gap-1">
            <select
              name="usuario"
              required
              defaultValue=""
              aria-label={`Asignar ${codigo} a`}
              className={`block ${ancho} rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs`}
            >
              <option value="" disabled>
                {pestana === "otros" ? "Reasignar a…" : "Asignar a…"}
              </option>
              {(operadores ?? [])
                .filter((o) => o.user_id !== s.asignado_a)
                .map((o) => (
                  <option key={o.user_id} value={o.user_id}>
                    {o.nombre}
                  </option>
                ))}
            </select>
            <button type="submit" className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50">
              Asignar
            </button>
          </form>
          {pestana === "otros" ? (
            <form action={devolverSolicitud.bind(null, s.id, volverA)}>
              <button type="submit" className="min-h-8 text-xs font-medium text-slate-600 hover:text-rose-700 hover:underline">
                Liberar
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </>
  );

  const enlaceCodigo = (s: FilaLista, codigo: string, href: string) =>
    pestana === "bolsa" ? (
      <ModalTomar codigo={codigo} href={href} accionTomar={tomarSolicitud.bind(null, s.id)} />
    ) : (
      <Link href={href} className="font-medium text-teal-700 hover:underline">
        {codigo}
      </Link>
    );

  const eps = (s: FilaLista) =>
    s.eps === "OTRA" ? <Insignia tono="aviso">{s.eps_texto ?? "Otra EPS"}</Insignia> : etiqueta(EPS, s.eps);

  return (
    <div className="space-y-4">
      <Notificaciones avisos={avisos} />

      <div
        role="tablist"
        aria-label="Colas"
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 [scrollbar-width:none] sm:mx-0 sm:px-0"
      >
        {pestanas.map((p) => {
          const activa = p.id === pestana;
          return (
            <Link
              key={p.id}
              role="tab"
              aria-selected={activa}
              href={`/lista-espera?tab=${p.id}`}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                activa ? "border-teal-700 text-teal-800" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {p.texto}
              <span
                className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${activa ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-600"}`}
              >
                {p.total}
              </span>
            </Link>
          );
        })}
      </div>

      <form method="get" className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
        <input type="hidden" name="tab" value={pestana} />
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 lg:max-w-sm">
            <BuscadorLocal />
          </div>
          <FiltrosPlegables activos={filtrosActivos}>
            <div className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-3 lg:grid-cols-6 lg:pt-0">
              <label className="text-xs text-slate-500">
                EPS
                <select name="eps" defaultValue={f.eps ?? ""} className={`${claseCampo} mt-1`}>
                  <option value="">Todas</option>
                  <Opciones mapa={EPS} />
                </select>
              </label>
              <label className="text-xs text-slate-500">
                Especialidad
                <select name="cat" defaultValue={f.cat ?? ""} className={`${claseCampo} mt-1`}>
                  <option value="">Todas</option>
                  <Opciones mapa={CATEGORIAS} />
                </select>
              </label>
              <label className="text-xs text-slate-500">
                Estado
                <select name="estado" defaultValue={f.estado ?? ""} className={`${claseCampo} mt-1`}>
                  <option value="">Todos</option>
                  <Opciones mapa={ESTADOS} />
                </select>
              </label>
              <label className="text-xs text-slate-500">
                Documentos
                <select name="doc" defaultValue={f.doc ?? ""} className={`${claseCampo} mt-1`}>
                  <option value="">Todos</option>
                  <Opciones mapa={ESTADO_DOCUMENTAL} />
                </select>
              </label>
              <label className="text-xs text-slate-500">
                Condición declarada
                <select name="factor" defaultValue={f.factor ?? ""} className={`${claseCampo} mt-1`}>
                  <option value="">Cualquiera</option>
                  <Opciones mapa={FACTORES} />
                </select>
              </label>
              <label className="text-xs text-slate-500">
                Ordenar por
                <select name="orden" defaultValue={f.orden} className={`${claseCampo} mt-1`}>
                  <option value="espera">Más tiempo en espera</option>
                  <option value="vencimiento">Vence primero</option>
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
              <label className="flex min-h-8 items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="alerta" value="1" defaultChecked={f.alerta} className="size-4 accent-teal-700" />
                Solo con alertas
              </label>
              <label className="flex min-h-8 items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="vence" value="7" defaultChecked={f.vence} className="size-4 accent-teal-700" />
                Vencen en 7 días o menos
              </label>
              <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
                {hayFiltros ? (
                  <Link href={volverA} className={`${claseBotonSecundario} flex-1 sm:flex-none`}>
                    Limpiar
                  </Link>
                ) : null}
                <a href="/exportar" className={`${claseBotonSecundario} flex-1 sm:flex-none`}>
                  Exportar CSV
                </a>
                <button type="submit" className={`${claseBoton} flex-1 sm:flex-none`}>
                  Aplicar filtros
                </button>
              </div>
            </div>
          </FiltrosPlegables>
        </div>
      </form>

      {error ? (
        <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">
          No se pudo cargar la lista. Intenta de nuevo.
        </p>
      ) : filas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
          {hayFiltros
            ? "Ninguna solicitud coincide con estos filtros."
            : pestana === "mia"
              ? "No tienes solicitudes asignadas. Toma una de la bolsa general."
              : pestana === "bolsa"
                ? "No hay solicitudes pendientes de asignación."
                : "Nadie más tiene solicitudes en gestión."}
        </p>
      ) : (
        <>
          {/* Teléfono y tableta: una tarjeta por solicitud. */}
          <ul className="space-y-2.5 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:hidden">
            {filas.map((s) => {
              const codigo = codigoSolicitud(s.numero);
              const href = `/solicitudes/${s.id}`;
              return (
                <li key={s.id} data-busqueda={textoBusqueda(s.nombre, s.documento)} className="rounded-xl border border-slate-200 bg-white p-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm">{enlaceCodigo(s, codigo, href)}</span>
                    <span className="text-sm font-medium text-slate-900 tabular-nums">
                      {s.dias_espera} {s.dias_espera === 1 ? "día" : "días"}
                      <span className="font-normal text-slate-500"> en espera</span>
                    </span>
                  </div>
                  <Link href={href} className="mt-1 block">
                    <span className="block font-medium text-slate-900">{s.nombre ?? "Sin nombre aún"}</span>
                    <span className="mt-0.5 block text-sm text-slate-600">
                      {eps(s)} · {etiqueta(CATEGORIAS, s.categoria_probable)}
                    </span>
                  </Link>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <Insignia tono={tonoEstado(s.estado)}>{etiqueta(ESTADOS, s.estado)}</Insignia>
                    <Insignia tono={tonoEstadoDocumental(s.estado_documental)}>
                      Docs: {etiqueta(ESTADO_DOCUMENTAL, s.estado_documental).toLowerCase()}
                    </Insignia>
                    {s.alertas_abiertas > 0 ? (
                      <Insignia tono="aviso">
                        {s.alertas_abiertas} {s.alertas_abiertas === 1 ? "alerta" : "alertas"}
                      </Insignia>
                    ) : null}
                    {s.dias_para_vencer !== null ? <Vence dias={s.dias_para_vencer} confianza={s.orden_vencimiento_confianza} largo /> : null}
                  </div>
                  {pestana !== "bolsa" || admin ? <div className="mt-3 border-t border-slate-100 pt-2.5">{acciones(s, codigo, "w-full max-w-52")}</div> : null}
                </li>
              );
            })}
          </ul>

          {/* Escritorio: tabla compacta (7 columnas, sin desplazamiento lateral a 1280 px). */}
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/60 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Solicitud</th>
                  <th className="px-3 py-2.5 font-medium">Paciente</th>
                  <th className="px-3 py-2.5 font-medium">Servicio</th>
                  <th className="px-3 py-2.5 font-medium">Espera</th>
                  <th className="px-3 py-2.5 font-medium">Estado</th>
                  <th className="px-3 py-2.5 text-right font-medium">Alertas</th>
                  {accionTitulo ? <th className="px-3 py-2.5 font-medium">{accionTitulo}</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filas.map((s) => {
                  const codigo = codigoSolicitud(s.numero);
                  const href = `/solicitudes/${s.id}`;
                  return (
                    <tr key={s.id} data-busqueda={textoBusqueda(s.nombre, s.documento)} className="transition-colors hover:bg-slate-50">
                      <td className="px-3 py-3 align-top whitespace-nowrap">
                        {enlaceCodigo(s, codigo, href)}
                        <div className="text-xs text-slate-500">{fecha(s.creada_en)}</div>
                      </td>
                      <td className="min-w-48 px-3 py-3 align-top">
                        <div className="text-slate-900">{s.nombre ?? "Sin nombre aún"}</div>
                        <div className="text-xs text-slate-500">
                          <span className="font-mono">{documentoOculto(s.documento)}</span> · {eps(s)}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="text-slate-900">{etiqueta(CATEGORIAS, s.categoria_probable)}</div>
                        <div className="max-w-52 truncate text-xs text-slate-500" title={s.servicio_texto ?? ""}>
                          {s.servicio_texto ?? "—"}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top whitespace-nowrap">
                        <div className="text-slate-900 tabular-nums">
                          {s.dias_espera} {s.dias_espera === 1 ? "día" : "días"}
                        </div>
                        <div className="mt-1 text-xs">
                          <span className="text-slate-500">Orden vence </span>
                          <Vence dias={s.dias_para_vencer} confianza={s.orden_vencimiento_confianza} />
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-col items-start gap-1">
                          <Insignia tono={tonoEstado(s.estado)}>{etiqueta(ESTADOS, s.estado)}</Insignia>
                          <Insignia tono={tonoEstadoDocumental(s.estado_documental)}>
                            Docs: {etiqueta(ESTADO_DOCUMENTAL, s.estado_documental).toLowerCase()}
                          </Insignia>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right align-top tabular-nums">
                        {s.alertas_abiertas > 0 ? <Insignia tono="aviso">{s.alertas_abiertas}</Insignia> : <span className="text-slate-400">—</span>}
                      </td>
                      {accionTitulo ? <td className="px-3 py-3 align-top">{acciones(s, codigo, "w-32")}</td> : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-xs text-slate-500">
        Este panel no agenda citas. La asignación final se hace en Visoft. Datos de prueba ficticios.
      </p>
    </div>
  );
}
