import Link from "next/link";
import { Tarjeta } from "@/app/componentes";
import { EPS, etiqueta } from "@/lib/catalogo";
import { esAdmin } from "@/lib/roles";
import { requerirSesion } from "@/lib/supabase/server";
import { AutoRefresco } from "@/components/AutoRefresco";

// Indicadores. Lo histórico sale de `metricas_diarias` (agregados anónimos que se suman justo
// antes de borrar cada solicitud gestionada); lo actual, de las solicitudes activas.

type FilaMetrica = {
  fecha: string;
  total_gestionadas: number;
  minutos_espera_acumulados: number;
  casos_por_operador_json: Record<string, number>;
  casos_por_eps_json: Record<string, number>;
};

const ALERTAS_DOCUMENTALES: Record<string, string> = {
  DOCUMENTO_ILEGIBLE: "Imagen borrosa o ilegible",
  DOCUMENTO_NO_PROCESABLE: "Archivo dañado o no admitido",
  HISTORIA_POSIBLEMENTE_INCOMPLETA: "Historia posiblemente incompleta",
  DISCREPANCIA_DOCUMENTO: "Documento no coincide",
  FECHA_VENCIMIENTO_NO_CONFIRMADA: "Fecha de vencimiento dudosa",
  ORDEN_PROXIMA_A_VENCER: "Orden próxima a vencer",
  ORDEN_POSIBLEMENTE_VENCIDA: "Orden posiblemente vencida",
  AUTORIZACION_POSIBLEMENTE_UTILIZADA: "Autorización posiblemente usada",
};

/** Fecha de hoy y de hace 29 días en hora de Colombia (YYYY-MM-DD). */
function fechasDeReferencia() {
  const ahora = new Date();
  const formato = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });
  return { hoy: formato(ahora), hace30: formato(new Date(ahora.getTime() - 29 * 86_400_000)) };
}

function duracion(minutos: number | null) {
  if (minutos === null || !Number.isFinite(minutos)) return "—";
  const m = Math.round(minutos);
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
}

function sumarJson(filas: FilaMetrica[], campo: "casos_por_operador_json" | "casos_por_eps_json") {
  const total: Record<string, number> = {};
  for (const f of filas) for (const [k, v] of Object.entries(f[campo] ?? {})) total[k] = (total[k] ?? 0) + Number(v);
  return total;
}

function Kpi({ icono, titulo, valor, detalle, href }: { icono: string; titulo: string; valor: string | number; detalle?: string; href?: string }) {
  const contenido = (
    <>
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <span aria-hidden="true">{icono}</span>
        {titulo}
      </p>
      <p className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{valor}</p>
      {detalle ? <p className="mt-0.5 text-xs text-slate-500">{detalle}</p> : null}
    </>
  );
  const clase = "block rounded-xl border border-slate-200 bg-white px-4 py-3";
  return href ? (
    <Link href={href} className={`${clase} transition-colors hover:border-teal-600/40`}>
      {contenido}
    </Link>
  ) : (
    <div className={clase}>{contenido}</div>
  );
}

function Barras({ datos, vacio }: { datos: { etiqueta: string; valor: number }[]; vacio: string }) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  if (!datos.length || datos.every((d) => d.valor === 0)) return <p className="text-sm text-slate-500">{vacio}</p>;
  return (
    <ul className="space-y-2.5">
      {datos.map((d) => (
        <li key={d.etiqueta}>
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-slate-700">{d.etiqueta}</span>
            <span className="font-medium text-slate-900 tabular-nums">{d.valor}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-slate-100" aria-hidden="true">
            <div className="h-2 rounded-full bg-teal-600" style={{ width: `${(d.valor / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function PaginaDashboard() {
  const { supabase, operador } = await requerirSesion();
  if (!operador) return null;

  const { hoy, hace30 } = fechasDeReferencia();

  const admin = esAdmin(operador.rol);
  // Totales anónimos para todos; el detalle por cola (quién tiene qué) solo para administradores.
  const [{ data: metricas }, { data: resumen }, { data: activas }, { data: alertas }, { data: operadores }] =
    await Promise.all([
      supabase.from("metricas_diarias").select("*").gte("fecha", hace30).order("fecha", { ascending: false }),
      supabase.rpc("resumen_espera"),
      admin
        ? supabase.from("solicitudes").select("asignado_a").not("asignado_a", "is", null)
        : Promise.resolve({ data: [] as { asignado_a: string }[] }),
      admin
        ? supabase.from("alertas").select("codigo").eq("resuelta", false)
        : Promise.resolve({ data: [] as { codigo: string }[] }),
      supabase.from("operadores").select("user_id, nombre"),
    ]);
  const r = (resumen ?? {}) as {
    total?: number;
    sin_asignar?: number;
    mas_de_15_dias?: number;
    por_eps?: Record<string, number>;
    casos_con_alerta_documental?: number;
    ocr_pendientes?: number;
    ocr_con_error?: number;
    worker_estado?: "ENCENDIDO" | "APAGADO" | "SIN_SENAL" | "NUNCA";
    worker_minutos_desde?: number | null;
    worker_equipo?: string | null;
  };
  // El estado lo calcula la base con su propia hora: ENCENDIDO, APAGADO (con el botón) o SIN_SENAL.
  const estadoWorker = r.worker_estado ?? "NUNCA";
  const hace = r.worker_minutos_desde == null ? "" : duracion(Number(r.worker_minutos_desde));
  const desde = r.worker_equipo ? ` en ${r.worker_equipo}` : "";
  const textoWorker = {
    ENCENDIDO: { titulo: "funcionando", detalle: `última señal hace ${hace}${desde}.` },
    APAGADO: { titulo: "apagado", detalle: `se apagó hace ${hace}${desde}. Los documentos quedan en cola hasta que se encienda.` },
    SIN_SENAL: {
      titulo: "sin señal",
      detalle: `última señal hace ${hace}${desde}. Puede que el equipo esté apagado o sin internet. Los documentos quedan en cola.`,
    },
    NUNCA: { titulo: "sin conectar", detalle: "todavía no se ha encendido nunca." },
  }[estadoWorker];
  const tonoWorker =
    estadoWorker === "ENCENDIDO"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : estadoWorker === "APAGADO"
        ? "border-slate-200 bg-slate-100 text-slate-700"
        : "border-amber-200 bg-amber-50 text-amber-900";

  const filas = (metricas ?? []) as FilaMetrica[];
  const deHoy = filas.find((f) => f.fecha === hoy);
  const total30 = filas.reduce((a, f) => a + f.total_gestionadas, 0);
  const minutos30 = filas.reduce((a, f) => a + Number(f.minutos_espera_acumulados), 0);
  const promedio30 = total30 ? minutos30 / total30 : null;
  const promedioHoy = deHoy?.total_gestionadas ? Number(deHoy.minutos_espera_acumulados) / deHoy.total_gestionadas : null;


  const nombres = new Map((operadores ?? []).map((o) => [o.user_id as string, o.nombre as string]));
  const porOperadorHoy = deHoy?.casos_por_operador_json ?? {};
  const porOperador30 = sumarJson(filas, "casos_por_operador_json");
  const enColaPorOperador: Record<string, number> = {};
  for (const s of activas ?? []) enColaPorOperador[s.asignado_a] = (enColaPorOperador[s.asignado_a] ?? 0) + 1;
  const idsOperador = [...new Set([...Object.keys(porOperador30), ...Object.keys(enColaPorOperador)])];
  const rendimiento = idsOperador
    .map((id) => ({
      nombre: id === "sistema" ? "Sistema" : (nombres.get(id) ?? "Usuario eliminado"),
      hoy: Number(porOperadorHoy[id] ?? 0),
      mes: porOperador30[id] ?? 0,
      enCola: enColaPorOperador[id] ?? 0,
    }))
    .sort((a, b) => b.hoy - a.hoy || b.mes - a.mes);

  const epsActivas = (["SALUD_TOTAL", "SOS", "OTRA", "SIN_DEFINIR"] as const)
    .map((e) => ({ etiqueta: etiqueta(EPS, e), valor: Number(r.por_eps?.[e] ?? 0) }))
    .filter((d) => d.valor > 0 || d.etiqueta === "Salud Total" || d.etiqueta === "SOS");
  const epsGestionadas = Object.entries(sumarJson(filas, "casos_por_eps_json"))
    .map(([e, v]) => ({ etiqueta: etiqueta(EPS, e), valor: v }))
    .sort((a, b) => b.valor - a.valor);

  const conteoAlertas: Record<string, number> = {};
  for (const a of alertas ?? []) conteoAlertas[a.codigo] = (conteoAlertas[a.codigo] ?? 0) + 1;
  const documentales = Object.entries(ALERTAS_DOCUMENTALES)
    .map(([codigo, texto]) => ({ etiqueta: texto, valor: conteoAlertas[codigo] ?? 0 }))
    .filter((d) => d.valor > 0);
  const totalDocumentales = Number(r.casos_con_alerta_documental ?? 0);

  return (
    <div className="space-y-5">
      <AutoRefresco segundos={20} />
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Indicadores de la sede Cali.{!admin ? " Vista de solo lectura." : ""} Históricos de los últimos
          30 días, sin datos de pacientes.
        </p>
      </div>

      <section
        aria-label="Lector de documentos"
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${tonoWorker}`}
      >
        <p>
          <span
            aria-hidden="true"
            className={`mr-2 inline-block size-2.5 rounded-full align-middle ${
              estadoWorker === "ENCENDIDO" ? "bg-emerald-500" : estadoWorker === "APAGADO" ? "bg-slate-400" : "bg-amber-500"
            }`}
          />
          <strong>Lector de documentos (OCR): {textoWorker.titulo}</strong> · {textoWorker.detalle}
        </p>
        <p className="tabular-nums">
          {Number(r.ocr_pendientes ?? 0)} en cola
          {Number(r.ocr_con_error ?? 0) > 0 ? ` · ${Number(r.ocr_con_error)} con error` : ""}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icono="⏱️"
          titulo="Tiempo promedio de espera"
          valor={duracion(promedio30)}
          detalle={`Hoy: ${duracion(promedioHoy)} · ${total30} casos en 30 días`}
        />
        <Kpi
          icono="📋"
          titulo="Pacientes en espera activa"
          valor={Number(r.total ?? 0)}
          detalle={`${Number(r.sin_asignar ?? 0)} sin asignar · ${Number(r.mas_de_15_dias ?? 0)} con más de 15 días`}
          href="/lista-espera?tab=bolsa"
        />
        <Kpi icono="✅" titulo="Gestionadas en la jornada" valor={deHoy?.total_gestionadas ?? 0} detalle={hoy} />
        <Kpi
          icono="🚨"
          titulo="Casos con alertas documentales"
          valor={totalDocumentales}
          detalle={admin ? `${(alertas ?? []).length} alertas abiertas en total` : "Solicitudes con al menos una"}
          href="/lista-espera?tab=bolsa&alerta=1"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Tarjeta titulo="👤 Rendimiento por operador">
            {rendimiento.length === 0 ? (
              <p className="text-sm text-slate-500">Todavía no hay casos gestionados ni asignados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Operador</th>
                      <th className="py-2 pr-4 text-right font-medium">Gestionadas hoy</th>
                      <th className="py-2 pr-4 text-right font-medium">Últimos 30 días</th>
                      {admin ? <th className="py-2 text-right font-medium">En su cola ahora</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rendimiento.map((fila) => (
                      <tr key={fila.nombre}>
                        <td className="py-2.5 pr-4 text-slate-900">{fila.nombre}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">{fila.hoy}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">{fila.mes}</td>
                        {admin ? <td className="py-2.5 text-right tabular-nums">{fila.enCola}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>
        </div>

        <Tarjeta titulo="🏥 Distribución por EPS">
          <p className="mb-2 text-xs font-medium text-slate-500">En espera ahora</p>
          <Barras datos={epsActivas} vacio="No hay solicitudes activas." />
          <p className="mt-5 mb-2 text-xs font-medium text-slate-500">Gestionadas (30 días)</p>
          <Barras datos={epsGestionadas} vacio="Aún no hay casos gestionados." />
        </Tarjeta>
      </div>

      {admin ? (
        <Tarjeta titulo="🚨 Alertas documentales abiertas">
          <Barras datos={documentales} vacio="No hay alertas documentales abiertas." />
        </Tarjeta>
      ) : null}
    </div>
  );
}
