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
  tonoEstado,
  tonoEstadoDocumental,
  type FilaLista,
} from "@/lib/catalogo";
import { requerirSesion } from "@/lib/supabase/server";

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

function Vence({ dias, confianza }: { dias: number | null; confianza: string | null }) {
  if (dias === null) return <span className="text-slate-400">Sin fecha</span>;
  const dudosa = confianza === "BAJA";
  const texto = dias < 0 ? `Hace ${-dias} d` : dias === 0 ? "Hoy" : `${dias} d`;
  const tono = dudosa ? "neutro" : dias <= 3 ? "peligro" : dias <= 7 ? "aviso" : "neutro";
  return (
    <Insignia tono={tono}>
      {texto}
      {dudosa ? " · fecha dudosa" : ""}
    </Insignia>
  );
}

export default async function PaginaLista({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const { supabase, operador } = await requerirSesion();
  if (!operador) return null;

  const f = {
    q: (uno(sp.q) ?? "").trim().slice(0, 60),
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
  if (esValor(EPS, f.eps)) consulta = consulta.eq("eps", f.eps);
  if (esValor(CATEGORIAS, f.cat)) consulta = consulta.eq("categoria_probable", f.cat);
  if (esValor(ESTADOS, f.estado)) consulta = consulta.eq("estado", f.estado);
  if (esValor(ESTADO_DOCUMENTAL, f.doc)) consulta = consulta.eq("estado_documental", f.doc);
  if (esValor(FACTORES, f.factor)) consulta = consulta.contains("factores", [f.factor]);
  if (f.alerta) consulta = consulta.gt("alertas_abiertas", 0);
  if (f.vence) consulta = consulta.lte("dias_para_vencer", 7);
  // Solo letras, números y espacios: evita inyectar operadores en el filtro.
  const q = f.q.replace(/[^\p{L}\p{N} ]/gu, "");
  if (q) consulta = consulta.or(`nombre.ilike.%${q}%,documento.ilike.%${q}%`);
  consulta =
    f.orden === "vencimiento"
      ? consulta.order("orden_vencimiento", { ascending: true, nullsFirst: false })
      : consulta.order("creada_en", { ascending: true });

  const [{ data, error }, { data: todas }] = await Promise.all([
    consulta.limit(500),
    supabase.from("lista_espera").select("estado, alertas_abiertas, dias_para_vencer"),
  ]);
  const filas = (data ?? []) as FilaLista[];
  const resumen = todas ?? [];
  const hayFiltros = Boolean(
    q || f.eps || f.cat || f.estado || f.doc || f.factor || f.alerta || f.vence || f.orden !== "espera",
  );
  const cerrada = uno(sp.cerrada);

  const tarjetas = [
    { titulo: "Solicitudes activas", valor: resumen.length, href: "/" },
    {
      titulo: "Listas para revisión",
      valor: resumen.filter((r) => r.estado === "LISTA_PARA_REVISION").length,
      href: "/?estado=LISTA_PARA_REVISION",
    },
    { titulo: "Con alertas", valor: resumen.filter((r) => r.alertas_abiertas > 0).length, href: "/?alerta=1" },
    {
      titulo: "Vencen en 7 días o menos",
      valor: resumen.filter((r) => r.dias_para_vencer !== null && r.dias_para_vencer <= 7).length,
      href: "/?vence=7&orden=vencimiento",
    },
  ];

  return (
    <div className="space-y-5">
      {cerrada ? (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Solicitud cerrada. Sus datos se eliminaron y se verificó que no quedó ningún registro asociado.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tarjetas.map((t) => (
          <Link
            key={t.titulo}
            href={t.href}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-teal-600/40"
          >
            <p className="text-xs text-slate-500">{t.titulo}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{t.valor}</p>
          </Link>
        ))}
      </div>

      <form method="get" className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <label className="col-span-2 text-xs text-slate-500">
            Buscar
            <input name="q" defaultValue={f.q} placeholder="Nombre o documento" className={`${claseCampo} mt-1`} />
          </label>
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
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="alerta" value="1" defaultChecked={f.alerta} className="size-4 accent-teal-700" />
            Solo con alertas
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="vence" value="7" defaultChecked={f.vence} className="size-4 accent-teal-700" />
            Vencen en 7 días o menos
          </label>
          <div className="ml-auto flex gap-2">
            {hayFiltros ? (
              <Link href="/" className={claseBotonSecundario}>
                Limpiar
              </Link>
            ) : null}
            <a href="/exportar" className={claseBotonSecundario}>
              Exportar CSV
            </a>
            <button type="submit" className={claseBoton}>
              Filtrar
            </button>
          </div>
        </div>
      </form>

      {error ? (
        <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">
          No se pudo cargar la lista. Intenta de nuevo.
        </p>
      ) : filas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
          {hayFiltros ? "Ninguna solicitud coincide con estos filtros." : "No hay solicitudes activas."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Solicitud</th>
                <th className="px-4 py-2.5 font-medium">Paciente</th>
                <th className="px-4 py-2.5 font-medium">EPS</th>
                <th className="px-4 py-2.5 font-medium">Servicio</th>
                <th className="px-4 py-2.5 text-right font-medium">Espera</th>
                <th className="px-4 py-2.5 font-medium">Orden vence</th>
                <th className="px-4 py-2.5 font-medium">Documentos</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5 text-right font-medium">Alertas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map((s) => (
                <tr key={s.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-4 py-3 align-top">
                    <Link href={`/solicitudes/${s.id}`} className="font-medium text-teal-700 hover:underline">
                      {codigoSolicitud(s.numero)}
                    </Link>
                    <div className="text-xs text-slate-500">{fecha(s.creada_en)}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="text-slate-900">{s.nombre ?? "Sin nombre aún"}</div>
                    <div className="font-mono text-xs text-slate-500">{documentoOculto(s.documento)}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {s.eps === "OTRA" ? (
                      <Insignia tono="aviso">{s.eps_texto ?? "Otra EPS"}</Insignia>
                    ) : (
                      etiqueta(EPS, s.eps)
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="text-slate-900">{etiqueta(CATEGORIAS, s.categoria_probable)}</div>
                    <div className="max-w-56 truncate text-xs text-slate-500" title={s.servicio_texto ?? ""}>
                      {s.servicio_texto ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums">
                    {s.dias_espera} {s.dias_espera === 1 ? "día" : "días"}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Vence dias={s.dias_para_vencer} confianza={s.orden_vencimiento_confianza} />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Insignia tono={tonoEstadoDocumental(s.estado_documental)}>
                      {etiqueta(ESTADO_DOCUMENTAL, s.estado_documental)}
                    </Insignia>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Insignia tono={tonoEstado(s.estado)}>{etiqueta(ESTADOS, s.estado)}</Insignia>
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums">
                    {s.alertas_abiertas > 0 ? <Insignia tono="aviso">{s.alertas_abiertas}</Insignia> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Este panel no agenda citas. La asignación final se hace en Visoft. Datos de prueba ficticios.
      </p>
    </div>
  );
}
