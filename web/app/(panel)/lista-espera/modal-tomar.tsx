"use client";

import Link from "next/link";
import { useRef } from "react";
import { useFormStatus } from "react-dom";

function BotonGestionar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-lg bg-teal-700 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-800 active:scale-[0.98] disabled:opacity-60"
    >
      {pending ? "Tomando…" : "Sí, gestionar"}
    </button>
  );
}

/**
 * Al abrir una solicitud de la bolsa general se pregunta si se quiere tomar. «No, solo ver» abre
 * la ficha en modo lectura (la ficha no permite editar lo que no está asignado a la persona).
 */
export function ModalTomar({
  codigo,
  href,
  accionTomar,
}: {
  codigo: string;
  href: string;
  accionTomar: () => Promise<void>;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => dialogo.current?.showModal()}
        className="font-medium text-teal-700 hover:underline"
      >
        {codigo}
      </button>
      <dialog
        ref={dialogo}
        aria-labelledby={`titulo-${codigo}`}
        className="m-auto w-[min(92vw,26rem)] rounded-xl border border-slate-200 bg-white p-0 text-left shadow-xl backdrop:bg-slate-900/40"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialogo.current?.close(); // clic fuera cierra
        }}
      >
        <div className="p-5">
          <h2 id={`titulo-${codigo}`} className="text-base font-semibold text-slate-900">
            Solicitud {codigo}
          </h2>
          <p className="mt-2 text-sm text-slate-600">¿Deseas tomar esta solicitud y moverla a tu cola de trabajo?</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Link
              href={href}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 active:scale-[0.98]"
            >
              No, solo ver
            </Link>
            <form action={accionTomar}>
              <BotonGestionar />
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}
