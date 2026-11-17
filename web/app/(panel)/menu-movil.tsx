"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type Enlace = { href: string; texto: string };

/**
 * Menú del teléfono: un botón en la barra superior abre un panel con las secciones, el usuario,
 * el interruptor del bot y la salida. Se cierra al navegar o con Escape.
 */
export function MenuMovil({ enlaces, pie }: { enlaces: Enlace[]; pie: ReactNode }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [rutaAbierta, setRutaAbierta] = useState(ruta);

  // Al cambiar de página el menú se cierra (se compara durante el render, sin efecto extra).
  if (rutaAbierta !== ruta) {
    setRutaAbierta(ruta);
    setAbierto(false);
  }

  useEffect(() => {
    if (!abierto) return;
    const alPresionar = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("keydown", alPresionar);
    return () => document.removeEventListener("keydown", alPresionar);
  }, [abierto]);

  const actual = enlaces.find((e) => ruta === e.href || ruta.startsWith(`${e.href}/`));

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        aria-controls="menu-movil"
        className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 active:bg-slate-50"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          {abierto ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
        </svg>
        {abierto ? "Cerrar" : (actual?.texto ?? "Menú")}
      </button>

      {abierto ? (
        <div id="menu-movil" className="absolute inset-x-0 top-full z-40 border-b border-slate-200 bg-white shadow-[0_12px_24px_-12px_rgb(15_23_42/0.25)]">
          <nav aria-label="Secciones" className="px-4 py-2">
            <ul className="divide-y divide-slate-100">
              {enlaces.map((e) => {
                const activo = e === actual;
                return (
                  <li key={e.href}>
                    <Link
                      href={e.href}
                      aria-current={activo ? "page" : undefined}
                      className={`flex min-h-12 items-center justify-between text-base ${
                        activo ? "font-semibold text-teal-800" : "text-slate-700"
                      }`}
                    >
                      {e.texto}
                      {activo ? <span className="size-2 rounded-full bg-teal-600" aria-hidden="true" /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">{pie}</div>
        </div>
      ) : null}
    </div>
  );
}
