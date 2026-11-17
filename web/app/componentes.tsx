import type { ReactNode } from "react";
import type { Tono } from "@/lib/catalogo";

const TONOS: Record<Tono, string> = {
  ok: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  aviso: "bg-amber-50 text-amber-900 ring-amber-600/25",
  peligro: "bg-rose-50 text-rose-800 ring-rose-600/20",
  neutro: "bg-slate-100 text-slate-700 ring-slate-500/20",
  info: "bg-sky-50 text-sky-800 ring-sky-600/20",
};

export function Insignia({ tono = "neutro", children }: { tono?: Tono; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${TONOS[tono]}`}
    >
      {children}
    </span>
  );
}

export function Tarjeta({
  titulo,
  accion,
  children,
}: {
  titulo: string;
  accion?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
        {accion}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function Dato({ nombre, children }: { nombre: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{nombre}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

export const claseCampo =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 sm:text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20";

export const claseBoton =
  "inline-flex items-center justify-center rounded-lg bg-teal-700 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 active:scale-[0.98]";

export const claseBotonSecundario =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 active:scale-[0.98]";
