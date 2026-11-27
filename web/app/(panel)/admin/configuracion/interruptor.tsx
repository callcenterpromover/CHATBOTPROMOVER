"use client";

import { useActionState, useId, useRef } from "react";
import { Notificaciones } from "@/components/Notificaciones";
import { cambiarConfiguracion, type ClaveConfiguracion, type ResultadoInterruptor } from "./actions";

type Textos = {
  encendido: string; // etiqueta del estado, p. ej. «Activo»
  apagado: string;
  confirmarEncender: { titulo: string; detalle: string; boton: string };
  confirmarApagar: { titulo: string; detalle: string; boton: string };
};

/** Interruptor de una configuración (solo super_admin). Pide confirmación antes de cambiar. */
export function Interruptor({ clave, activoInicial, textos }: { clave: ClaveConfiguracion; activoInicial: boolean; textos: Textos }) {
  const [estado, accion, pendiente] = useActionState<ResultadoInterruptor, FormData>(cambiarConfiguracion, {
    activo: activoInicial,
    aviso: null,
  });
  const dialogo = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const activo = estado.activo;
  const confirmar = activo ? textos.confirmarApagar : textos.confirmarEncender;

  return (
    <>
      <Notificaciones avisos={estado.aviso ? [estado.aviso] : []} />
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        disabled={pendiente}
        onClick={() => dialogo.current?.showModal()}
        className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
          activo
            ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
        }`}
      >
        <span aria-hidden="true" className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${activo ? "bg-emerald-500" : "bg-slate-400"}`}>
          <span
            className={`inline-block size-3 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${
              activo ? "translate-x-3.5" : "translate-x-0.5"
            }`}
          />
        </span>
        {pendiente ? "Cambiando…" : activo ? textos.encendido : textos.apagado}
      </button>

      <dialog
        ref={dialogo}
        aria-labelledby={idTitulo}
        className="m-auto w-[min(92vw,26rem)] rounded-xl border border-slate-200 bg-white p-0 text-left shadow-xl backdrop:bg-slate-900/40"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialogo.current?.close();
        }}
      >
        <form action={accion} onSubmit={() => dialogo.current?.close()} className="p-5">
          <input type="hidden" name="clave" value={clave} />
          <input type="hidden" name="activo" value={activo ? "0" : "1"} />
          <h2 id={idTitulo} className="text-base font-semibold text-slate-900">
            {confirmar.titulo}
          </h2>
          <p className="mt-2 text-sm text-slate-600">{confirmar.detalle}</p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogo.current?.close()}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={`rounded-lg px-3.5 py-2 text-sm font-medium text-white active:scale-[0.98] ${
                activo ? "bg-rose-700 hover:bg-rose-800" : "bg-teal-700 hover:bg-teal-800"
              }`}
            >
              {confirmar.boton}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
