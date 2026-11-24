"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icono, type NombreIcono } from "@/components/Iconos";

/** Cómo se reconoce la página activa: ruta y, opcionalmente, un parámetro con su valor por defecto. */
export type Coincidencia = { ruta: string; param?: string; valor?: string; porDefecto?: boolean };
export type SubItem = { href: string; texto: string; coincide: Coincidencia };
export type ItemNav = {
  href: string;
  texto: string;
  icono: NombreIcono;
  conteo?: number;
  coincide: Coincidencia;
  hijos?: SubItem[];
};
export type GrupoNav = { titulo: string; items: ItemNav[] };

const COOKIE = "lateral";

function useActivo() {
  const ruta = usePathname();
  const sp = useSearchParams();
  return (c: Coincidencia, exacta = false) => {
    const enRuta = exacta ? ruta === c.ruta : ruta === c.ruta || ruta.startsWith(`${c.ruta}/`);
    if (!enRuta) return false;
    if (!c.param) return true;
    const actual = sp.get(c.param);
    return actual === c.valor || (c.porDefecto === true && !actual);
  };
}

function ListaNav({ grupos, contraida }: { grupos: GrupoNav[]; contraida: boolean }) {
  const activo = useActivo();
  return (
    <nav aria-label="Secciones" className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4">
      {grupos.map((g) => (
        <div key={g.titulo}>
          <p
            className={`mb-1.5 px-2.5 text-[11px] font-semibold tracking-[0.06em] text-tinta-300/80 uppercase ${
              contraida ? "sr-only" : ""
            }`}
          >
            {g.titulo}
          </p>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const esActivo = activo(it.coincide, !it.hijos);
              const seccionAbierta = it.hijos && activo({ ruta: it.coincide.ruta });
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    aria-current={esActivo && !it.hijos ? "page" : undefined}
                    title={contraida ? it.texto : undefined}
                    className={`group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors ${
                      esActivo || seccionAbierta
                        ? "bg-tinta-700 font-medium text-white"
                        : "text-tinta-200 hover:bg-tinta-800 hover:text-white"
                    } ${contraida ? "justify-center px-0" : ""}`}
                  >
                    <Icono nombre={it.icono} className="size-[18px] shrink-0" />
                    {contraida ? (
                      it.conteo ? (
                        <span className="sr-only">
                          {it.texto}, {it.conteo}
                        </span>
                      ) : (
                        <span className="sr-only">{it.texto}</span>
                      )
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate">{it.texto}</span>
                        {it.conteo != null ? (
                          <span
                            className={`cifras rounded-md px-1.5 py-px text-xs ${
                              esActivo ? "bg-white/15 text-white" : "text-tinta-300"
                            }`}
                          >
                            {it.conteo}
                          </span>
                        ) : null}
                      </>
                    )}
                  </Link>
                  {it.hijos && seccionAbierta && !contraida ? (
                    <ul className="mt-0.5 mb-1 ml-[22px] space-y-0.5 border-l border-tinta-700 pl-2.5">
                      {it.hijos.map((h) => {
                        const hActivo = activo(h.coincide);
                        return (
                          <li key={h.href}>
                            <Link
                              href={h.href}
                              aria-current={hActivo ? "page" : undefined}
                              className={`flex h-8 items-center rounded-md px-2.5 text-[13px] transition-colors ${
                                hActivo ? "bg-tinta-800 font-medium text-white" : "text-tinta-300 hover:text-white"
                              }`}
                            >
                              {h.texto}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Marca({ contraida }: { contraida: boolean }) {
  return (
    <div className={`flex h-14 shrink-0 items-center gap-2.5 border-b border-white/5 ${contraida ? "justify-center" : "px-5"}`}>
      <span className="grid size-7 place-items-center rounded-md bg-teal-500 text-[13px] font-bold text-tinta-950">P</span>
      {contraida ? null : (
        <span className="leading-tight">
          <span className="block text-sm font-semibold tracking-wide text-white">PROMOVER</span>
          <span className="block text-[11px] text-tinta-300">Sede Cali · Agendamiento</span>
        </span>
      )}
    </div>
  );
}

/** Barra lateral de escritorio. Se contrae a un riel de íconos; la preferencia se guarda en una cookie
 *  para que el servidor la pinte igual en la próxima carga (sin parpadeo). */
export function BarraLateral({ grupos, contraidaInicial }: { grupos: GrupoNav[]; contraidaInicial: boolean }) {
  const [contraida, setContraida] = useState(contraidaInicial);
  const alternar = () => {
    const nueva = !contraida;
    setContraida(nueva);
    document.cookie = `${COOKIE}=${nueva ? "contraida" : "abierta"}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <aside
      className={`lateral sticky top-0 hidden h-dvh shrink-0 flex-col bg-tinta-900 lg:flex ${contraida ? "w-16" : "w-60"}`}
    >
      <Marca contraida={contraida} />
      <ListaNav grupos={grupos} contraida={contraida} />
      <button
        type="button"
        onClick={alternar}
        aria-label={contraida ? "Expandir menú" : "Contraer menú"}
        title={contraida ? "Expandir menú" : "Contraer menú"}
        className={`m-2.5 flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm text-tinta-300 transition-colors hover:bg-tinta-800 hover:text-white ${
          contraida ? "justify-center" : ""
        }`}
      >
        <Icono nombre={contraida ? "expandir" : "contraer"} className="size-[18px]" />
        {contraida ? null : "Contraer menú"}
      </button>
    </aside>
  );
}

/** Cajón de navegación para celular y tableta: el mismo menú, abierto desde la barra superior. */
export function CajonNavegacion({ grupos, pie }: { grupos: GrupoNav[]; pie: ReactNode }) {
  const ruta = usePathname();
  const sp = useSearchParams();
  const clave = `${ruta}?${sp.toString()}`;
  const [abierto, setAbierto] = useState(false);
  const [claveAbierta, setClaveAbierta] = useState(clave);
  if (claveAbierta !== clave) {
    setClaveAbierta(clave);
    setAbierto(false);
  }
  useEffect(() => {
    if (!abierto) return;
    const alPresionar = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("keydown", alPresionar);
    const desplazamiento = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alPresionar);
      document.body.style.overflow = desplazamiento;
    };
  }, [abierto]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir menú"
        aria-expanded={abierto}
        className="grid size-10 place-items-center rounded-lg text-slate-700 transition-transform hover:bg-slate-100 active:scale-[0.97]"
      >
        <Icono nombre="menu" />
      </button>
      {/* Portal al body: la barra superior usa backdrop-filter, que encierra a los elementos fijos. */}
      {abierto ? createPortal(
        <div className="fixed inset-0 z-50">
          <div className="velo absolute inset-0 bg-slate-900/40" onClick={() => setAbierto(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menú"
            className="cajon lateral absolute inset-y-0 left-0 flex w-[min(84vw,18rem)] flex-col bg-tinta-900 shadow-[8px_0_24px_-8px_rgb(0_0_0/0.35)]"
          >
            <div className="flex items-center justify-between pr-2">
              <Marca contraida={false} />
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar menú"
                className="grid size-10 place-items-center rounded-lg text-tinta-200 hover:bg-tinta-800 hover:text-white"
              >
                <Icono nombre="cerrar" />
              </button>
            </div>
            <ListaNav grupos={grupos} contraida={false} />
            <div className="border-t border-white/10 p-4">{pie}</div>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
