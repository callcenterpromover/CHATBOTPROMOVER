import Link from "next/link";
import { Insignia, Tarjeta, claseBotonSecundario } from "@/app/componentes";
import { AutoRefresco } from "@/components/AutoRefresco";
import { Icono } from "@/components/Iconos";
import { Notificaciones, type Aviso } from "@/components/Notificaciones";
import { CargaAlEnviar } from "@/components/PantallaCarga";
import type { SupabaseClient } from "@supabase/supabase-js";
import { modoSimulacion } from "@/lib/bot/estado";
import {
  ETIQUETA_GRAVEDAD,
  ETIQUETA_ORIGEN,
  agruparErrores,
  explicarErrorOcr,
  ordenarRevisiones,
  revisarConfiguracion,
  type EstadoSistema,
  type FilaRegistro,
  type Gravedad,
  type VariablesPresentes,
} from "@/lib/diagnostico";
import type { Tono } from "@/lib/catalogo";
import { requerirRol } from "@/lib/supabase/server";
import { marcarRevisados } from "./actions";

// Registro de errores (solo super_admin): revisión de la configuración, causas más probables del
// problema actual y el registro técnico reciente. Nunca muestra datos de pacientes ni valores de claves.

const MENSAJES: Record<string, Aviso> = {
  revisado: { tono: "ok", texto: "Error marcado como revisado. Si vuelve a ocurrir, aparecerá de nuevo." },
  todos: { tono: "ok", texto: "Todos los errores abiertos quedaron marcados como revisados." },
  revisar: { tono: "error", texto: "No se pudo marcar como revisado. Intenta de nuevo." },
};

const TONO_GRAVEDAD: Record<Gravedad, Tono> = { critica: "peligro", alta: "peligro", media: "aviso", baja: "neutro" };

const fecha = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function hace(iso: string, ahora: number) {
  const min = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "hace menos de 1 min";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

/** Hora del servidor para esta petición (fuera del componente: es una página dinámica). */
function instante() {
  return Date.now();
}

async function variablesPresentes(db: SupabaseClient): Promise<VariablesPresentes> {
  const hay = (k: string) => Boolean(process.env[k]?.trim());
  return {
    SUPABASE_SECRET_KEY: hay("SUPABASE_SECRET_KEY"),
    KAPSO_API_KEY: hay("KAPSO_API_KEY"),
    KAPSO_PHONE_NUMBER_ID: hay("KAPSO_PHONE_NUMBER_ID"),
    KAPSO_WEBHOOK_SECRET: hay("KAPSO_WEBHOOK_SECRET"),
    META_APP_SECRET: hay("META_APP_SECRET"),
    META_PHONE_NUMBER_ID: hay("META_PHONE_NUMBER_ID"),
    META_WHATSAPP_TOKEN: hay("META_WHATSAPP_TOKEN"),
    WORKER_SECRET_VALIDO: (process.env.WORKER_SECRET ?? "").length >= 32,
    MODO_SIMULACION: await modoSimulacion(db),
  };
}

export default async function PaginaErrores({ searchParams }: PageProps<"/admin/errores">) {
  const { supabase } = await requerirRol(["super_admin"]);
  const sp = await searchParams;
  const clave = typeof sp.ok === "string" ? sp.ok : typeof sp.error === "string" ? sp.error : "";
  const filtro = typeof sp.origen === "string" && ETIQUETA_ORIGEN[sp.origen] ? sp.origen : "";

  const ahora = instante();
  const hace30dias = new Date(ahora - 30 * 86_400_000).toISOString();
  const [{ data: estado, error: errorEstado }, { data: filas, error: errorFilas }] = await Promise.all([
    supabase.rpc("diagnostico_sistema"),
    supabase
      .from("registro_errores")
      .select("id, origen, codigo, detalle, repeticiones, primero_en, ultimo_en, revisado")
      .gte("ultimo_en", hace30dias)
      .order("ultimo_en", { ascending: false })
      .limit(500),
  ]);

  const registro = (filas ?? []) as FilaRegistro[];
  const sistema = errorEstado ? null : (estado as EstadoSistema);
  const revisiones = ordenarRevisiones(revisarConfiguracion(await variablesPresentes(supabase), sistema, ahora));
  const grupos = agruparErrores(registro, ahora);
  const fallas = revisiones.filter((r) => !r.ok);

  // Causas más probables: primero lo que está mal configurado, luego los errores que más pesan.
  const probables = [
    ...fallas.map((r) => ({ clave: `cfg-${r.id}`, titulo: r.titulo, detalle: r.detalle, gravedad: r.gravedad, extra: "Configuración" })),
    ...grupos.map((g) => ({
      clave: `err-${g.origen}-${g.codigo}`,
      titulo: g.explicacion.titulo,
      detalle: `${g.explicacion.causa} ${g.explicacion.solucion}`,
      gravedad: g.explicacion.gravedad,
      extra: `${g.total} ${g.total === 1 ? "vez" : "veces"} · ${hace(g.ultimo_en, ahora)}`,
    })),
  ].slice(0, 5);

  const recientes = registro.filter((f) => !filtro || f.origen === filtro).slice(0, 100);
  const erroresOcr = Object.entries(sistema?.ocr_errores_por_codigo ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-5">
      <AutoRefresco segundos={30} />
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.01em] text-slate-900">Registro de errores</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Qué está fallando en el bot, el envío de mensajes y el OCR, y cómo corregirlo. Se actualiza cada 30 segundos. No
          muestra datos de pacientes ni valores de claves.
        </p>
      </div>
      <Notificaciones avisos={MENSAJES[clave] ? [MENSAJES[clave]] : []} />

      {errorFilas ? (
        <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          No se pudo leer el registro de errores. Aplica en Supabase la migración{" "}
          <code className="font-mono text-xs">20261127000000_registro_errores.sql</code>.
        </p>
      ) : null}

      <Tarjeta titulo="Causas más probables ahora">
        {probables.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-emerald-800">
            <Icono nombre="check" className="size-4" />
            Todo en orden: la configuración está completa y no hay errores sin revisar.
          </p>
        ) : (
          <ol className="space-y-3">
            {probables.map((p, i) => (
              <li key={p.clave} className="flex gap-3">
                <span className="cifras grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                    {p.titulo}
                    <Insignia tono={TONO_GRAVEDAD[p.gravedad]}>{ETIQUETA_GRAVEDAD[p.gravedad]}</Insignia>
                    <span className="text-xs font-normal text-slate-500">{p.extra}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">{p.detalle}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Tarjeta>

      <Tarjeta titulo="Revisión de la configuración">
        <ul className="divide-y divide-slate-100">
          {revisiones.map((r) => (
            <li key={r.id} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
              <span
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${
                  r.ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                }`}
                aria-label={r.ok ? "Correcto" : "Con problema"}
              >
                <Icono nombre={r.ok ? "check" : "alerta"} className="size-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{r.titulo}</p>
                <p className="text-sm text-slate-600">{r.detalle}</p>
              </div>
            </li>
          ))}
        </ul>
        {sistema?.ultimo_mensaje_recibido ? (
          <p className="mt-3 text-xs text-slate-500">
            Último mensaje de WhatsApp aceptado: {fecha.format(new Date(sistema.ultimo_mensaje_recibido))} (
            {hace(sistema.ultimo_mensaje_recibido, ahora)}).
          </p>
        ) : null}
      </Tarjeta>

      <Tarjeta
        titulo="Errores sin revisar (últimos 30 días)"
        accion={
          grupos.length ? (
            <form action={marcarRevisados}>
              <CargaAlEnviar mensaje="Marcando como revisados…" />
              <button type="submit" className={`${claseBotonSecundario} py-1.5 text-xs`}>
                Marcar todos como revisados
              </button>
            </form>
          ) : null
        }
      >
        {grupos.length === 0 ? (
          <p className="text-sm text-slate-500">No hay errores sin revisar.</p>
        ) : (
          <ul className="space-y-3">
            {grupos.map((g) => (
              <li key={`${g.origen}-${g.codigo}`} className="rounded-lg border border-slate-200 p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                      {g.explicacion.titulo}
                      <Insignia tono={TONO_GRAVEDAD[g.explicacion.gravedad]}>{ETIQUETA_GRAVEDAD[g.explicacion.gravedad]}</Insignia>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {ETIQUETA_ORIGEN[g.origen] ?? g.origen} · <code className="font-mono">{g.codigo}</code> · {g.total}{" "}
                      {g.total === 1 ? "vez" : "veces"} · última {hace(g.ultimo_en, ahora)}
                    </p>
                  </div>
                  <form action={marcarRevisados}>
                    <input type="hidden" name="origen" value={g.origen} />
                    <input type="hidden" name="codigo" value={g.codigo} />
                    <CargaAlEnviar mensaje="Marcando como revisado…" />
                    <button type="submit" className={`${claseBotonSecundario} py-1.5 text-xs`}>
                      Marcar revisado
                    </button>
                  </form>
                </div>
                <dl className="mt-2.5 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Causa probable</dt>
                    <dd className="text-slate-700">{g.explicacion.causa}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Cómo corregirlo</dt>
                    <dd className="text-slate-700">{g.explicacion.solucion}</dd>
                  </div>
                </dl>
                {g.detalle ? <p className="mt-2 text-xs text-slate-500">Detalle: {g.detalle}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta titulo="Errores del OCR">
        {!sistema ? (
          <p className="text-sm text-slate-500">Sin datos del OCR.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {sistema.ocr_pendientes} documento(s) en cola · {sistema.ocr_con_error} en ERROR
              {sistema.worker_ultimo_latido ? ` · última señal del worker ${hace(sistema.worker_ultimo_latido, ahora)}` : ""}
            </p>
            {erroresOcr.length ? (
              <ul className="space-y-2">
                {erroresOcr.map(([codigo, n]) => {
                  const ex = explicarErrorOcr(codigo);
                  return (
                    <li key={codigo} className="text-sm">
                      <p className="font-medium text-slate-900">
                        {ex.titulo} <span className="font-normal text-slate-500">({n})</span>
                      </p>
                      <p className="text-slate-600">
                        {ex.causa} {ex.solucion}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        )}
      </Tarjeta>

      <Tarjeta titulo="Registro reciente">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[["", "Todos"], ...Object.entries(ETIQUETA_ORIGEN)].map(([id, texto]) => (
            <Link
              key={id || "todos"}
              href={id ? `/admin/errores?origen=${id}` : "/admin/errores"}
              aria-current={filtro === id ? "page" : undefined}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                filtro === id ? "bg-tinta-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {texto}
            </Link>
          ))}
        </div>
        {recientes.length === 0 ? (
          <p className="text-sm text-slate-500">Sin registros.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="px-5 py-2 font-medium">Última vez</th>
                  <th className="px-3 py-2 font-medium">Origen</th>
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 text-right font-medium">Veces</th>
                  <th className="px-5 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recientes.map((f) => (
                  <tr key={f.id}>
                    <td className="cifras px-5 py-2 whitespace-nowrap text-slate-700">{fecha.format(new Date(f.ultimo_en))}</td>
                    <td className="px-3 py-2 text-slate-700">{ETIQUETA_ORIGEN[f.origen] ?? f.origen}</td>
                    <td className="px-3 py-2">
                      <code className="font-mono text-xs text-slate-900">{f.codigo}</code>
                      {f.detalle ? <span className="block text-xs text-slate-500">{f.detalle}</span> : null}
                    </td>
                    <td className="cifras px-3 py-2 text-right text-slate-700">{f.repeticiones}</td>
                    <td className="px-5 py-2">
                      {f.revisado ? <Insignia tono="ok">Revisado</Insignia> : <Insignia tono="aviso">Abierto</Insignia>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </div>
  );
}
