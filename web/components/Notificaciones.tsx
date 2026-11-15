"use client";

import { useEffect, useRef, useState } from "react";

export type Aviso = { tono: "ok" | "error" | "info"; texto: string };

// Parámetros de la URL que traen avisos (los ponen las acciones al redirigir). Se quitan de la
// barra de direcciones apenas se muestran, para que recargar la página no repita el aviso.
const PARAMETROS_AVISO = ["ok", "error", "aviso", "cerrada", "expirada", "salida"];
const DURACION = { ok: 4000, info: 4000, error: 7000 } as const;
const ESTILOS = {
  ok: "border-emerald-200 bg-white text-slate-900 [--marca:var(--color-emerald-600)]",
  info: "border-sky-200 bg-white text-slate-900 [--marca:var(--color-sky-600)]",
  error: "border-rose-200 bg-white text-slate-900 [--marca:var(--color-rose-600)]",
} as const;
const ICONOS = { ok: "✓", info: "i", error: "!" } as const;

type Visible = Aviso & { id: number; saliendo: boolean };

/** Notificaciones flotantes en la parte superior que desaparecen solas después de unos segundos. */
export function Notificaciones({ avisos }: { avisos: Aviso[] }) {
  const [lista, setLista] = useState<Visible[]>([]);
  const siguienteId = useRef(0);
  const procesada = useRef<string | null>(null);
  const firma = JSON.stringify(avisos);

  useEffect(() => {
    // Cada conjunto de avisos se muestra una sola vez (React puede ejecutar el efecto dos veces).
    if (procesada.current === firma) return;
    procesada.current = firma;
    const nuevos: Aviso[] = JSON.parse(firma);
    if (!nuevos.length) return;
    const conId = nuevos.map((a) => ({ ...a, id: ++siguienteId.current, saliendo: false }));
    // Mostrar los avisos nuevos (se sincroniza con lo que trae la URL).
    setLista((actual) => [...actual, ...conId]);

    const url = new URL(window.location.href);
    let cambio = false;
    for (const p of PARAMETROS_AVISO) {
      if (url.searchParams.has(p)) {
        url.searchParams.delete(p);
        cambio = true;
      }
    }
    if (cambio) window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [firma]);

  const cerrar = (id: number) => {
    setLista((l) => l.map((a) => (a.id === id ? { ...a, saliendo: true } : a)));
    setTimeout(() => setLista((l) => l.filter((a) => a.id !== id)), 200);
  };

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4"
    >
      {lista.map((a) => (
        <Tarjeta key={a.id} aviso={a} onCerrar={() => cerrar(a.id)} />
      ))}
    </div>
  );
}

function Tarjeta({ aviso, onCerrar }: { aviso: Visible; onCerrar: () => void }) {
  const [pausado, setPausado] = useState(false);
  const cerrarRef = useRef(onCerrar);
  useEffect(() => {
    cerrarRef.current = onCerrar;
  });

  useEffect(() => {
    if (pausado || aviso.saliendo) return;
    const t = setTimeout(() => cerrarRef.current(), DURACION[aviso.tono]);
    return () => clearTimeout(t);
  }, [pausado, aviso.saliendo, aviso.tono]);

  return (
    <div
      role={aviso.tono === "error" ? "alert" : "status"}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      className={`aviso-flotante pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg shadow-slate-900/10 ${ESTILOS[aviso.tono]} ${
        aviso.saliendo ? "aviso-saliendo" : ""
      }`}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--marca)] text-xs font-bold text-white"
      >
        {ICONOS[aviso.tono]}
      </span>
      <p className="flex-1">{aviso.texto}</p>
      <button
        type="button"
        onClick={onCerrar}
        aria-label="Cerrar notificación"
        className="-mr-1 rounded-md px-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
      >
        ×
      </button>
    </div>
  );
}
