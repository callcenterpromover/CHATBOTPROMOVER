"use client";

import { useActionState, useRef } from "react";
import { Notificaciones } from "@/components/Notificaciones";
import { cambiarEstadoBot, type ResultadoBot } from "./bot-actions";

/** Interruptor del bot de WhatsApp en el encabezado (solo super_admin). Pide confirmación antes de cambiar. */
export function InterruptorBot({ activoInicial }: { activoInicial: boolean }) {
  const [estado, accion, pendiente] = useActionState<ResultadoBot, FormData>(cambiarEstadoBot, {
    activo: activoInicial,
    aviso: null,
  });
  const dialogo = useRef<HTMLDialogElement>(null);
  const activo = estado.activo;

  return (
    <>
      <Notificaciones avisos={estado.aviso ? [estado.aviso] : []} />
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        disabled={pendiente}
        onClick={() => dialogo.current?.showModal()}
        title={activo ? "El bot responde automáticamente. Clic para pausar." : "El bot está pausado. Clic para encender."}
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
          activo
            ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
        }`}
      >
        <span
          aria-hidden="true"
          className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${activo ? "bg-emerald-500" : "bg-slate-400"}`}
        >
          <span
            className={`inline-block size-3 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${
              activo ? "translate-x-3.5" : "translate-x-0.5"
            }`}
          />
        </span>
        {pendiente ? "Cambiando…" : activo ? "Bot WhatsApp: activo" : "Bot WhatsApp: pausado"}
      </button>

      <dialog
        ref={dialogo}
        aria-labelledby="titulo-bot"
        className="m-auto w-[min(92vw,26rem)] rounded-xl border border-slate-200 bg-white p-0 text-left shadow-xl backdrop:bg-slate-900/40"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialogo.current?.close();
        }}
      >
        <form action={accion} onSubmit={() => dialogo.current?.close()} className="p-5">
          <input type="hidden" name="activo" value={activo ? "0" : "1"} />
          <h2 id="titulo-bot" className="text-base font-semibold text-slate-900">
            {activo ? "¿Pausar el bot de WhatsApp?" : "¿Encender el bot de WhatsApp?"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {activo
              ? "Los pacientes que escriban al +57 317 6550770 no recibirán respuestas automáticas y sus mensajes no se registrarán en la lista de espera. El equipo deberá atenderlos directamente."
              : "El bot empezará a responder automáticamente a los pacientes que escriban al +57 317 6550770 y a registrar sus solicitudes."}
          </p>
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
              {activo ? "Sí, pausar" : "Sí, encender"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
