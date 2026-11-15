"use client";

import { useEffect, useState } from "react";

export function formatoTranscurrido(segundos: number) {
  const s = Math.max(0, Math.floor(segundos));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${m % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

/**
 * Tiempo transcurrido que avanza cada segundo. Parte del valor que calculó el servidor (con la hora
 * de la base) y suma lo que pasa en el navegador, así no depende de que el reloj del equipo esté bien.
 */
export function TiempoTranscurrido({ segundosIniciales }: { segundosIniciales: number }) {
  const [extra, setExtra] = useState(0);

  useEffect(() => {
    const inicio = performance.now();
    const id = setInterval(() => setExtra((performance.now() - inicio) / 1000), 1000);
    return () => clearInterval(id);
  }, [segundosIniciales]);

  return (
    <time className="tabular-nums" suppressHydrationWarning>
      {formatoTranscurrido(segundosIniciales + extra)}
    </time>
  );
}
