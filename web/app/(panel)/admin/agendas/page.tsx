import Link from "next/link";
import { Insignia, Tarjeta, claseBoton, claseBotonSecundario, claseCampo } from "@/app/componentes";
import { Notificaciones, type Aviso } from "@/components/Notificaciones";
import { CargaAlEnviar } from "@/components/PantallaCarga";
import { cargarCatalogo } from "@/lib/catalogo-agendas";
import { DIAS, GRUPOS, aMinutos, crucesAgendaSos, type Catalogo, type GrupoEdad, type ServicioCita } from "@/lib/horarios";
import { REQUISITOS, type IpsSos, type Lineamiento } from "@/lib/lineamientos";
import { requerirRol } from "@/lib/supabase/server";
import { eliminarRegistro, guardarConfig, guardarFranjas, guardarIps, guardarLineamiento, guardarServicio } from "./actions";
import { EditorFranjas } from "./editor-franjas";
import { SelectorServicio } from "./selector-servicio";

const MENSAJES: Record<string, Aviso> = {
  servicio: { tono: "ok", texto: "Servicio actualizado." },
  creado: { tono: "ok", texto: "Servicio creado. Ahora configura su horario." },
  franjas: { tono: "ok", texto: "Horario guardado. El bot ya lo usa en las conversaciones nuevas." },
  config: { tono: "ok", texto: "Edad de corte actualizada." },
  guardado: { tono: "ok", texto: "Cambios guardados." },
  eliminado: { tono: "ok", texto: "Registro eliminado." },
  datos: { tono: "error", texto: "Revisa los datos: hay campos vacíos o con valores no válidos." },
  permiso: { tono: "error", texto: "Solo los administradores pueden modificar las agendas." },
  cruzadas: { tono: "error", texto: "Hay franjas que se cruzan el mismo día." },
  corta: { tono: "error", texto: "Una franja no alcanza para la duración de la cita." },
  cruce_sos: {
    tono: "error",
    texto: "No se guardó: la fisioterapia SOS se cruzaría con los especialistas (comparten profesional). Revisa la Agenda SOS.",
  },
  grupo: { tono: "error", texto: "El grupo de edad no corresponde a este servicio." },
  duplicado: { tono: "error", texto: "Ya existe un registro con ese código o nombre." },
  no_encontrado: { tono: "error", texto: "El registro ya no existe." },
  guardar: { tono: "error", texto: "No se pudo guardar el cambio. Intenta de nuevo." },
};

const EPS_SERVICIO = { TODAS: "Todas las EPS", SALUD_TOTAL: "Salud Total", SOS: "SOS" } as const;
const MENUS = { PRINCIPAL: "Menú principal", ESPECIALISTAS: "Submenú Especialistas" } as const;
const AGENDAS = { "": "Ninguna", FISIO_SOS: "Fisioterapia SOS", ESPECIALISTAS_SOS: "Especialistas SOS" } as const;
const VISTAS = [
  { id: "servicios", texto: "Servicios y horarios" },
  { id: "sos", texto: "Agenda SOS" },
  { id: "reglas", texto: "Reglas y lineamientos" },
] as const;

const etiqueta = "block text-xs font-medium text-slate-600";
const casilla = "size-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600";

export default async function PaginaAgendas({ searchParams }: PageProps<"/admin/agendas">) {
  const { supabase } = await requerirRol(["super_admin", "administrador"]);
  const sp = await searchParams;
  const clave = typeof sp.ok === "string" ? sp.ok : typeof sp.error === "string" ? sp.error : "";
  const vista = VISTAS.some((v) => v.id === sp.v) ? (sp.v as (typeof VISTAS)[number]["id"]) : "servicios";

  const [catalogo, { data: ips }, { data: lineamientos }] = await Promise.all([
    cargarCatalogo(supabase),
    supabase.from("ips_sos").select("*").order("orden").order("id"),
    supabase.from("lineamientos_generales").select("*").order("orden").order("id"),
  ]);
  const cat: Catalogo = catalogo ?? { servicios: [], franjas: [], edadCorteNinos: 18 };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.01em] text-slate-900">{VISTAS.find((v) => v.id === vista)?.texto}</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Servicios, horarios de atención y lineamientos de agendamiento. El bot los usa para ofrecer franjas; nunca agenda ni
          confirma citas.
        </p>
      </div>
      <Notificaciones avisos={MENSAJES[clave] ? [MENSAJES[clave]] : []} />


      {!catalogo ? (
        <p className="rounded-lg bg-rose-50 p-4 text-sm text-rose-800">No se pudo leer el catálogo de agendas.</p>
      ) : vista === "sos" ? (
        <AgendaSos cat={cat} />
      ) : vista === "reglas" ? (
        <Reglas edadCorte={cat.edadCorteNinos} ips={(ips ?? []) as IpsSos[]} lineamientos={(lineamientos ?? []) as Lineamiento[]} />
      ) : (
        <Servicios cat={cat} seleccion={typeof sp.s === "string" ? sp.s : ""} grupo={typeof sp.g === "string" ? sp.g : ""} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ servicios

function Servicios({ cat, seleccion, grupo }: { cat: Catalogo; seleccion: string; grupo: string }) {
  const servicio = cat.servicios.find((s) => String(s.id) === seleccion) ?? (seleccion === "nuevo" ? null : cat.servicios[0]);
  const nuevo = seleccion === "nuevo";

  return (
    <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <SelectorServicio
        actual={nuevo ? "nuevo" : String(servicio?.id ?? "")}
        grupos={(["SALUD_TOTAL", "SOS", "TODAS"] as const)
          .map((eps) => ({ eps: EPS_SERVICIO[eps], servicios: cat.servicios.filter((s) => s.eps === eps) }))
          .filter((g) => g.servicios.length)}
      />
      <aside className="hidden space-y-4 lg:block">
        {(["SALUD_TOTAL", "SOS", "TODAS"] as const).map((eps) => {
          const lista = cat.servicios.filter((s) => s.eps === eps);
          if (!lista.length) return null;
          return (
            <div key={eps}>
              <h2 className="px-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{EPS_SERVICIO[eps]}</h2>
              <ul className="mt-1 space-y-0.5">
                {lista.map((s) => {
                  const n = cat.franjas.filter((f) => f.servicio_id === s.id).length;
                  const activo = !nuevo && servicio?.id === s.id;
                  return (
                    <li key={s.id}>
                      <Link
                        href={`/admin/agendas?s=${s.id}`}
                        aria-current={activo ? "page" : undefined}
                        className={`block rounded-lg px-2 py-1.5 text-sm ${activo ? "bg-teal-50 text-teal-900" : "text-slate-700 hover:bg-slate-100"}`}
                      >
                        <span className={`block leading-snug ${s.activo ? "" : "text-slate-400 line-through"}`}>{s.nombre}</span>
                        <span className="text-xs text-slate-500">
                          {s.duracion_min} min · {n ? `${n} franja${n === 1 ? "" : "s"}` : "sin horario"}
                          {s.menu === "ESPECIALISTAS" ? " · especialista" : ""}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        <Link href="/admin/agendas?s=nuevo" className={`${claseBotonSecundario} w-full`}>
          + Nuevo servicio
        </Link>
      </aside>

      <div className="min-w-0 space-y-5">
        {servicio && !nuevo ? <HorarioServicio cat={cat} servicio={servicio} grupo={grupo} /> : null}
        <FormularioServicio servicio={nuevo ? null : servicio} />
      </div>
    </div>
  );
}

function HorarioServicio({ cat, servicio, grupo }: { cat: Catalogo; servicio: ServicioCita; grupo: string }) {
  const g: GrupoEdad = servicio.por_grupo_edad ? (grupo === "NINOS" ? "NINOS" : "ADULTOS") : "TODOS";
  const iniciales = cat.franjas
    .filter((f) => f.servicio_id === servicio.id && f.grupo_edad === g)
    .map((f) => ({ dia: f.dia_semana, inicio: f.hora_inicio.slice(0, 5), fin: f.hora_fin.slice(0, 5) }));

  return (
    <Tarjeta
      titulo={`Horario de atención · ${servicio.nombre}`}
      accion={
        servicio.por_grupo_edad ? (
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 text-xs" role="group" aria-label="Grupo de edad">
            {(["NINOS", "ADULTOS"] as const).map((x) => (
              <Link
                key={x}
                href={`/admin/agendas?s=${servicio.id}&g=${x}`}
                aria-current={g === x ? "page" : undefined}
                className={`rounded-md px-2.5 py-1 font-medium ${g === x ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
              >
                {GRUPOS[x]}
              </Link>
            ))}
          </div>
        ) : null
      }
    >
      <p className="mb-3 text-sm text-slate-500">
        Cada franja es el horario de atención. La última cita empieza {servicio.duracion_min} minutos antes del final.
        {servicio.por_grupo_edad ? ` Niños: menores de ${cat.edadCorteNinos} años.` : ""}
      </p>
      <EditorFranjas
        key={`${servicio.id}-${g}-${servicio.duracion_min}-${JSON.stringify(iniciales)}`}
        nombre={servicio.nombre}
        duracion={servicio.duracion_min}
        iniciales={iniciales}
        accion={guardarFranjas.bind(null, servicio.id, g, servicio.duracion_min)}
      />
    </Tarjeta>
  );
}

function Opciones({ valores }: { valores: Record<string, string> }) {
  return Object.entries(valores).map(([v, t]) => (
    <option key={v} value={v}>
      {t}
    </option>
  ));
}

function FormularioServicio({ servicio }: { servicio: ServicioCita | null }) {
  const s = servicio;
  return (
    <Tarjeta titulo={s ? "Datos del servicio" : "Nuevo servicio"}>
      <form action={guardarServicio.bind(null, s?.id ?? null)} className="grid gap-4 sm:grid-cols-2">
        <CargaAlEnviar mensaje="Guardando servicio…" />
        <label className="sm:col-span-2">
          <span className={etiqueta}>Nombre que ve el paciente</span>
          <input name="nombre" required minLength={3} maxLength={80} defaultValue={s?.nombre} className={`${claseCampo} mt-1`} />
        </label>
        {!s ? (
          <label>
            <span className={etiqueta}>Código interno (mayúsculas, sin espacios)</span>
            <input name="codigo" required pattern="[A-Za-z0-9_]{2,40}" maxLength={40} placeholder="VAL_EJEMPLO" className={`${claseCampo} mt-1`} />
          </label>
        ) : null}
        <label className={s ? "sm:col-span-2" : ""}>
          <span className={etiqueta}>Nombre de agendamiento en Visoft</span>
          <input name="nombre_visoft" maxLength={160} defaultValue={s?.nombre_visoft ?? ""} className={`${claseCampo} mt-1`} />
        </label>
        <label>
          <span className={etiqueta}>Duración de la cita (minutos)</span>
          <input name="duracion_min" type="number" required min={5} max={240} step={5} defaultValue={s?.duracion_min ?? 15} className={`${claseCampo} mt-1`} />
        </label>
        <label>
          <span className={etiqueta}>EPS</span>
          <select name="eps" defaultValue={s?.eps ?? "TODAS"} className={`${claseCampo} mt-1`}>
            <Opciones valores={EPS_SERVICIO} />
          </select>
        </label>
        <label>
          <span className={etiqueta}>Dónde aparece en el bot</span>
          <select name="menu" defaultValue={s?.menu ?? "PRINCIPAL"} className={`${claseCampo} mt-1`}>
            <Opciones valores={MENUS} />
          </select>
        </label>
        <label>
          <span className={etiqueta}>Agenda compartida (SOS)</span>
          <select name="agenda" defaultValue={s?.agenda ?? ""} className={`${claseCampo} mt-1`}>
            <Opciones valores={AGENDAS} />
          </select>
        </label>
        <label>
          <span className={etiqueta}>Edad mínima (vacío = sin límite)</span>
          <input name="edad_minima" type="number" min={0} max={120} defaultValue={s?.edad_minima ?? ""} className={`${claseCampo} mt-1`} />
        </label>
        <label>
          <span className={etiqueta}>Orden en el menú</span>
          <input name="orden" type="number" min={0} max={999} defaultValue={s?.orden ?? 0} className={`${claseCampo} mt-1`} />
        </label>
        <label>
          <span className={etiqueta}>Autorización · Salud Total</span>
          <select name="autorizacion_salud_total" defaultValue={s?.autorizacion_salud_total ?? "NO"} className={`${claseCampo} mt-1`}>
            <Opciones valores={REQUISITOS} />
          </select>
        </label>
        <label>
          <span className={etiqueta}>OPS · SOS</span>
          <select name="autorizacion_sos" defaultValue={s?.autorizacion_sos ?? "NO"} className={`${claseCampo} mt-1`}>
            <Opciones valores={REQUISITOS} />
          </select>
        </label>
        <label>
          <span className={etiqueta}>Ubicación (solo para el equipo)</span>
          <input name="ubicacion" maxLength={160} defaultValue={s?.ubicacion ?? ""} className={`${claseCampo} mt-1`} />
        </label>
        <label>
          <span className={etiqueta}>Profesional (solo para el equipo)</span>
          <input name="profesional" maxLength={120} defaultValue={s?.profesional ?? ""} className={`${claseCampo} mt-1`} />
        </label>
        <label className="sm:col-span-2">
          <span className={etiqueta}>Notas para el equipo (se muestran al agendar)</span>
          <textarea name="notas_equipo" rows={3} maxLength={600} defaultValue={s?.notas_equipo ?? ""} className={`${claseCampo} mt-1`} />
        </label>
        <div className="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="por_grupo_edad" defaultChecked={s?.por_grupo_edad ?? false} className={casilla} />
            Horario separado para niños y adultos
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="activo" defaultChecked={s?.activo ?? true} className={casilla} />
            Activo (el bot lo ofrece)
          </label>
        </div>
        {s?.por_grupo_edad ? (
          <p className="text-xs text-amber-700 sm:col-span-2">
            Si desmarcas «niños y adultos», se borran los horarios por grupo y debes cargar uno general.
          </p>
        ) : null}
        <div className="sm:col-span-2">
          <button type="submit" className={claseBoton}>
            {s ? "Guardar servicio" : "Crear servicio"}
          </button>
        </div>
      </form>
    </Tarjeta>
  );
}

// ------------------------------------------------------------------ agenda SOS

const INICIO_DIA = 7 * 60;
const FIN_DIA = 17 * 60 + 30;

function AgendaSos({ cat }: { cat: Catalogo }) {
  const servicios = cat.servicios.filter((s) => s.activo && s.agenda);
  const cruces = crucesAgendaSos(cat);
  const dias = [1, 2, 3, 4, 5, 6];
  const horas = Array.from({ length: (FIN_DIA - INICIO_DIA) / 60 + 1 }, (_, i) => INICIO_DIA + i * 60).filter((m) => m < FIN_DIA);
  const pos = (min: number) => `${((min - INICIO_DIA) / (FIN_DIA - INICIO_DIA)) * 100}%`;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        En SOS todas las citas van a la agenda del fisioterapeuta SOS: la fisioterapia SOS solo puede darse fuera de los horarios de
        especialistas. Los cruces se bloquean al guardar.
      </p>
      {cruces.length ? (
        <ul className="space-y-1 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
          {cruces.map((c, i) => (
            <li key={i}>
              {DIAS[c.dia]} {c.rango}: {c.fisio} se cruza con {c.especialista}.
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-emerald-700">Sin cruces entre fisioterapia SOS y especialistas.</p>
      )}

      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-teal-500/70" /> Fisioterapia SOS
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-violet-500/70" /> Especialistas SOS
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3">
        <div className="grid min-w-[44rem] grid-cols-[3rem_repeat(6,minmax(0,1fr))] gap-2">
          <div />
          {dias.map((d) => (
            <div key={d} className="text-center text-xs font-semibold text-slate-600">
              {DIAS[d]}
            </div>
          ))}
          <div className="relative h-[34rem]">
            {horas.map((m) => (
              <span key={m} className="absolute right-1 -translate-y-1/2 text-[11px] text-slate-400 tabular-nums" style={{ top: pos(m) }}>
                {Math.floor(m / 60)}:00
              </span>
            ))}
          </div>
          {dias.map((d) => {
            const bloques = cat.franjas
              .filter((f) => f.dia_semana === d)
              .map((f) => ({ f, s: servicios.find((s) => s.id === f.servicio_id) }))
              .filter((x): x is { f: typeof x.f; s: ServicioCita } => !!x.s);
            const columnas = [...new Set(bloques.map((b) => b.s.id))];
            return (
              <div key={d} className="relative h-[34rem] rounded-md bg-slate-50">
                {horas.map((m) => (
                  <span key={m} className="absolute inset-x-0 border-t border-slate-200/70" style={{ top: pos(m) }} />
                ))}
                {bloques.map(({ f, s }, i) => {
                  const col = columnas.indexOf(s.id);
                  const ancho = 100 / Math.max(columnas.length, 1);
                  return (
                    <Link
                      key={i}
                      href={`/admin/agendas?s=${s.id}`}
                      title={`${s.nombre} · ${f.hora_inicio.slice(0, 5)}–${f.hora_fin.slice(0, 5)}`}
                      className={`absolute overflow-hidden rounded px-1 py-0.5 text-[10px] leading-tight text-white hover:brightness-110 ${
                        s.agenda === "FISIO_SOS" ? "bg-teal-600/80" : "bg-violet-600/80"
                      }`}
                      style={{
                        top: pos(aMinutos(f.hora_inicio)),
                        height: `calc(${pos(aMinutos(f.hora_fin))} - ${pos(aMinutos(f.hora_inicio))})`,
                        left: `${col * ancho}%`,
                        width: `calc(${ancho}% - 2px)`,
                      }}
                    >
                      {s.nombre}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-slate-500">Haz clic en un bloque para editar el horario de ese servicio.</p>
    </div>
  );
}

// ------------------------------------------------------------------ reglas

function Reglas({ edadCorte, ips, lineamientos }: { edadCorte: number; ips: IpsSos[]; lineamientos: Lineamiento[] }) {
  return (
    <div className="space-y-5">
      <Tarjeta titulo="Grupos de edad">
        <form action={guardarConfig} className="flex flex-wrap items-end gap-3">
          <CargaAlEnviar mensaje="Guardando…" />
          <label>
            <span className={etiqueta}>Se considera niño quien tiene menos de (años)</span>
            <input name="edad_corte_ninos" type="number" min={1} max={30} required defaultValue={edadCorte} className={`${claseCampo} mt-1 w-32`} />
          </label>
          <button type="submit" className={claseBoton}>
            Guardar
          </button>
          <p className="basis-full text-xs text-slate-500">Se usa en los servicios con horario separado para niños y adultos.</p>
        </form>
      </Tarjeta>

      <Tarjeta titulo="IPS de los pacientes SOS">
        <p className="mb-3 text-sm text-slate-500">Se muestran al equipo en cada solicitud SOS para verificar la OPS.</p>
        <ul className="space-y-2">
          {ips.map((i) => (
            <li key={i.id} className="rounded-lg border border-slate-200 p-3">
              <FilaIps ips={i} />
            </li>
          ))}
          <li className="rounded-lg border border-dashed border-slate-300 p-3">
            <FilaIps ips={null} />
          </li>
        </ul>
      </Tarjeta>

      <Tarjeta titulo="Lineamientos generales">
        <p className="mb-3 text-sm text-slate-500">
          Aparecen en «A verificar al agendar» de cada solicitud, según la EPS y la edad del paciente.
        </p>
        <ul className="space-y-2">
          {lineamientos.map((l) => (
            <li key={l.id} className="rounded-lg border border-slate-200 p-3">
              <FilaLineamiento lineamiento={l} />
            </li>
          ))}
          <li className="rounded-lg border border-dashed border-slate-300 p-3">
            <FilaLineamiento lineamiento={null} />
          </li>
        </ul>
      </Tarjeta>
    </div>
  );
}

function FilaIps({ ips }: { ips: IpsSos | null }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <form action={guardarIps.bind(null, ips?.id ?? null)} className="flex flex-1 flex-wrap items-end gap-3">
        <CargaAlEnviar mensaje="Guardando…" />
        <label className="min-w-40 flex-1">
          <span className={etiqueta}>{ips ? "IPS" : "Nueva IPS"}</span>
          <input name="nombre" required minLength={2} maxLength={80} defaultValue={ips?.nombre ?? ""} className={`${claseCampo} mt-1`} />
        </label>
        <label className="min-w-56 flex-[2]">
          <span className={etiqueta}>Nota</span>
          <input name="nota" maxLength={300} defaultValue={ips?.nota ?? ""} className={`${claseCampo} mt-1`} />
        </label>
        <label className="w-20">
          <span className={etiqueta}>Orden</span>
          <input name="orden" type="number" min={0} max={999} defaultValue={ips?.orden ?? 0} className={`${claseCampo} mt-1`} />
        </label>
        <div className="flex flex-wrap gap-x-4 gap-y-1 pb-2 text-sm text-slate-700">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="es_primaria" defaultChecked={ips?.es_primaria ?? false} className={casilla} /> Primaria
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="requiere_ops" defaultChecked={ips?.requiere_ops ?? false} className={casilla} /> Requiere OPS
          </label>
          {ips ? (
            <label className="flex items-center gap-1.5">
              <input type="checkbox" name="activo" defaultChecked={ips.activo} className={casilla} /> Activa
            </label>
          ) : null}
        </div>
        <button type="submit" className={claseBotonSecundario}>
          {ips ? "Guardar" : "Agregar"}
        </button>
      </form>
      {ips ? <BotonEliminar accion={eliminarRegistro.bind(null, "ips_sos", ips.id)} nombre={ips.nombre} /> : null}
    </div>
  );
}

function FilaLineamiento({ lineamiento: l }: { lineamiento: Lineamiento | null }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <form action={guardarLineamiento.bind(null, l?.id ?? null)} className="grid flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_5rem]">
        <CargaAlEnviar mensaje="Guardando…" />
        <label>
          <span className={etiqueta}>{l ? "Título" : "Nuevo lineamiento"}</span>
          <input name="titulo" required minLength={3} maxLength={80} defaultValue={l?.titulo ?? ""} className={`${claseCampo} mt-1`} />
        </label>
        <label>
          <span className={etiqueta}>Aplica a</span>
          <select name="aplica_eps" defaultValue={l?.aplica_eps ?? "TODAS"} className={`${claseCampo} mt-1`}>
            <Opciones valores={EPS_SERVICIO} />
          </select>
        </label>
        <label>
          <span className={etiqueta}>Orden</span>
          <input name="orden" type="number" min={0} max={999} defaultValue={l?.orden ?? 0} className={`${claseCampo} mt-1`} />
        </label>
        <label className="sm:col-span-3">
          <span className={etiqueta}>Texto</span>
          <textarea name="texto" required minLength={3} maxLength={600} rows={2} defaultValue={l?.texto ?? ""} className={`${claseCampo} mt-1`} />
        </label>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-3">
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input type="checkbox" name="solo_menores" defaultChecked={l?.solo_menores ?? false} className={casilla} /> Solo menores de edad
          </label>
          {l ? (
            <label className="flex items-center gap-1.5 text-sm text-slate-700">
              <input type="checkbox" name="activo" defaultChecked={l.activo} className={casilla} /> Activo
            </label>
          ) : null}
          {l && !l.activo ? <Insignia>Inactivo</Insignia> : null}
          <button type="submit" className={claseBotonSecundario}>
            {l ? "Guardar" : "Agregar"}
          </button>
        </div>
      </form>
      {l ? <BotonEliminar accion={eliminarRegistro.bind(null, "lineamientos_generales", l.id)} nombre={l.titulo} /> : null}
    </div>
  );
}

function BotonEliminar({ accion, nombre }: { accion: () => Promise<void>; nombre: string }) {
  return (
    <form action={accion}>
      <CargaAlEnviar mensaje="Eliminando…" />
      <button
        type="submit"
        aria-label={`Eliminar ${nombre}`}
        className="rounded-lg px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
      >
        Eliminar
      </button>
    </form>
  );
}
