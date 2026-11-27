"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icono } from "@/components/Iconos";

const COLAS: Record<string, string> = { mia: "Mi bandeja", bolsa: "Por tomar", otros: "En gestión por otros" };
const VISTAS_AGENDA: Record<string, string> = { servicios: "Servicios y horarios", sos: "Agenda SOS", reglas: "Reglas y lineamientos" };

type Miga = { texto: string; href?: string };

function migas(ruta: string, sp: URLSearchParams): Miga[] {
  if (ruta.startsWith("/lista-espera"))
    return [{ texto: "Lista de espera" }, { texto: COLAS[sp.get("tab") ?? "mia"] ?? COLAS.mia }];
  if (ruta.startsWith("/solicitudes/")) return [{ texto: "Lista de espera", href: "/lista-espera" }, { texto: "Solicitud" }];
  if (ruta.startsWith("/dashboard")) return [{ texto: "Seguimiento" }, { texto: "Indicadores" }];
  if (ruta.startsWith("/admin/agendas"))
    return [{ texto: "Configuración" }, { texto: "Agendas", href: "/admin/agendas" }, { texto: VISTAS_AGENDA[sp.get("v") ?? "servicios"] ?? VISTAS_AGENDA.servicios }];
  if (ruta.startsWith("/admin/usuarios")) return [{ texto: "Configuración" }, { texto: "Usuarios" }];
  if (ruta.startsWith("/admin/errores")) return [{ texto: "Configuración" }, { texto: "Registro de errores" }];
  if (ruta.startsWith("/admin/configuracion")) return [{ texto: "Configuración" }, { texto: "Configuraciones" }];
  if (ruta.startsWith("/simulador")) return [{ texto: "Herramientas" }, { texto: "Simulador de WhatsApp" }];
  return [];
}

/** Ubicación actual (migas de pan). En celular solo se ve el último nivel. */
export function Migas() {
  const lista = migas(usePathname(), useSearchParams());
  return (
    <nav aria-label="Ubicación" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {lista.map((m, i) => {
          const ultima = i === lista.length - 1;
          return (
            <li key={i} className={`flex min-w-0 items-center gap-1.5 ${ultima ? "" : "hidden sm:flex"}`}>
              {m.href && !ultima ? (
                <Link href={m.href} className="truncate text-slate-500 hover:text-slate-900">
                  {m.texto}
                </Link>
              ) : (
                <span className={`truncate ${ultima ? "font-semibold text-slate-900" : "text-slate-500"}`} aria-current={ultima ? "page" : undefined}>
                  {m.texto}
                </span>
              )}
              {ultima ? null : <Icono nombre="flecha" className="size-3.5 shrink-0 text-slate-400" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** «Ir a solicitud» por número (S-0123 o 123). El número no es un dato personal, así que puede ir en la URL;
 *  nombre y documento se buscan solo en la lista, localmente. Atajo: Ctrl/⌘ + K. */
export function IrASolicitud() {
  const router = useRouter();
  const campo = useRef<HTMLInputElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const atajo = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        campo.current?.focus();
        campo.current?.select();
      }
    };
    document.addEventListener("keydown", atajo);
    return () => document.removeEventListener("keydown", atajo);
  }, []);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const n = (campo.current?.value ?? "").replace(/\D/g, "");
        if (!n) {
          setError(true);
          return;
        }
        setError(false);
        router.push(`/solicitudes/ir?numero=${n}`);
      }}
      className="relative hidden w-56 md:block xl:w-64"
    >
      <Icono nombre="buscar" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={campo}
        inputMode="numeric"
        aria-label="Ir a la solicitud número"
        aria-invalid={error || undefined}
        placeholder="Ir a solicitud (número)"
        onChange={() => error && setError(false)}
        className={`h-9 w-full rounded-lg border bg-slate-50 pr-12 pl-8 text-sm text-slate-900 outline-none placeholder:text-slate-500 focus:bg-white focus:ring-2 ${
          error ? "border-rose-400 focus:ring-rose-500/20" : "border-slate-200 focus:border-teal-600 focus:ring-teal-600/20"
        }`}
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 font-sans text-[11px] text-slate-500">
        Ctrl K
      </kbd>
    </form>
  );
}

/** Menú del usuario: nombre, rol y salir. Se cierra con Escape o al hacer clic fuera. */
export function MenuUsuario({ nombre, rol, salir }: { nombre: string; rol: string; salir: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const iniciales = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-label={`Cuenta de ${nombre}`}
        className="flex h-9 items-center gap-2 rounded-lg pr-1.5 pl-1 transition-transform hover:bg-slate-100 active:scale-[0.97]"
      >
        <span className="grid size-7 place-items-center rounded-full bg-tinta-900 text-xs font-semibold text-white">{iniciales || "?"}</span>
        <span className="hidden text-left leading-tight xl:block">
          <span className="block max-w-36 truncate text-sm font-medium text-slate-900">{nombre}</span>
          <span className="block text-[11px] text-slate-500">{rol}</span>
        </span>
      </button>
      {abierto ? (
        <div role="menu" className="emergente absolute top-11 right-0 z-40 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_12px_32px_-12px_rgb(15_23_42/0.3)]">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium text-slate-900">{nombre}</p>
            <p className="text-xs text-slate-500">{rol}</p>
          </div>
          <div className="my-1 border-t border-slate-100" />
          {salir}
        </div>
      ) : null}
    </div>
  );
}
