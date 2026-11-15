"use client";

import { useEffect, useState } from "react";

const MENSAJES_POR_DEFECTO = [
  "Conectando con el servidor seguro...",
  "Sincronizando lista de espera...",
  "Cargando solicitudes...",
  "Preparando la información...",
];

type Props = {
  /** Frases que rotan debajo de la barra (cada 2,5 s). */
  mensajes?: string[];
  /** Tiempo máximo antes de mostrar el error con «Reintentar» (ms). */
  tiempoMaximo?: number;
};

/**
 * Barra de progreso para las cargas del panel. El avance es simulado: se acerca al 92 % y se
 * queda ahí hasta que llega el contenido real (que reemplaza al componente). Si pasan
 * `tiempoMaximo` ms sin respuesta, se detiene y ofrece reintentar.
 */
export function ProgressLoader({ mensajes = MENSAJES_POR_DEFECTO, tiempoMaximo = 10_000 }: Props) {
  const [progreso, setProgreso] = useState(4);
  const [indice, setIndice] = useState(0);
  const [agotado, setAgotado] = useState(false);

  useEffect(() => {
    if (agotado) return;
    // Avance asintótico: rápido al principio, cada vez más lento, nunca pasa de 92 %.
    const avance = setInterval(() => setProgreso((p) => Math.min(92, p + (92 - p) * 0.12)), 400);
    const rotacion = setInterval(() => setIndice((i) => (i + 1) % mensajes.length), 2500);
    const limite = setTimeout(() => setAgotado(true), tiempoMaximo);
    return () => {
      clearInterval(avance);
      clearInterval(rotacion);
      clearTimeout(limite);
    };
  }, [agotado, mensajes.length, tiempoMaximo]);

  if (agotado) {
    return (
      <div role="alert" className="mx-auto mt-16 max-w-sm rounded-xl border border-rose-200 bg-white p-6 text-center">
        <p className="text-sm font-semibold text-slate-900">La carga está tardando más de lo normal</p>
        <p className="mt-1 text-sm text-slate-600">
          Puede ser la conexión a internet o el servidor. Revisa tu conexión e intenta de nuevo.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-teal-700 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-800 active:scale-[0.98]"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-16 max-w-sm px-4" aria-busy="true">
      <div
        role="progressbar"
        aria-label="Cargando"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progreso)}
        className="h-1.5 overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className="h-full rounded-full bg-teal-600 transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${progreso}%` }}
        />
      </div>
      <p aria-live="polite" className="mt-3 text-center text-sm text-slate-500">
        {mensajes[indice]}
      </p>
    </div>
  );
}
