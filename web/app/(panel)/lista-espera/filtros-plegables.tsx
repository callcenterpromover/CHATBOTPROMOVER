"use client";

import { useState, type ReactNode } from "react";

/** En pantallas pequeñas los filtros quedan detrás de un botón; en escritorio siempre se ven. */
export function FiltrosPlegables({ activos, children }: { activos: number; children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        aria-controls="filtros-lista"
        className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 active:bg-slate-50 lg:hidden"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M3 5h14M6 10h8M8.5 15h3" />
        </svg>
        Filtros
        {activos ? (
          <span className="rounded-full bg-teal-700 px-1.5 text-xs font-semibold text-white tabular-nums">{activos}</span>
        ) : null}
      </button>
      <div id="filtros-lista" className={`${abierto ? "block" : "hidden"} basis-full lg:block`}>
        {children}
      </div>
    </>
  );
}
