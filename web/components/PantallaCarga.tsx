"use client";

import { useFormStatus } from "react-dom";

/** Pantalla completa de espera (por ejemplo al iniciar o cerrar sesión). */
export function PantallaCarga({ mensaje }: { mensaje: string }) {
  return (
    <div
      role="status"
      aria-live="assertive"
      className="pantalla-carga fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-white/90 backdrop-blur-sm"
    >
      <p className="text-xs font-semibold tracking-widest text-teal-700 uppercase">PROMOVER S.A.S.</p>
      <span
        aria-hidden="true"
        className="size-10 animate-spin rounded-full border-4 border-teal-100 border-t-teal-700 motion-reduce:animate-none"
      />
      <p className="text-sm font-medium text-slate-700">{mensaje}</p>
    </div>
  );
}

/** Se coloca dentro de un <form>: muestra la pantalla de carga mientras el envío está en curso. */
export function CargaAlEnviar({ mensaje }: { mensaje: string }) {
  const { pending } = useFormStatus();
  return pending ? <PantallaCarga mensaje={mensaje} /> : null;
}
