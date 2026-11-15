"use client";

import { useState } from "react";
import { claseCampo } from "@/app/componentes";

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Busca por nombre o documento SOLO en el navegador, sobre las filas ya cargadas. El texto buscado
 * nunca viaja en la URL, así que no queda en el historial ni en los registros del servidor.
 */
export function BuscadorLocal() {
  const [sinResultados, setSinResultados] = useState(false);

  function filtrar(valor: string) {
    const termino = normalizar(valor);
    let visibles = 0;
    document.querySelectorAll<HTMLElement>("[data-busqueda]").forEach((fila) => {
      const coincide = !termino || (fila.dataset.busqueda ?? "").includes(termino);
      fila.hidden = !coincide;
      if (coincide) visibles += 1;
    });
    setSinResultados(Boolean(termino) && visibles === 0);
  }

  return (
    <label className="col-span-2 text-xs text-slate-500">
      Buscar en esta lista
      <input
        type="search"
        autoComplete="off"
        placeholder="Nombre o documento"
        onChange={(e) => filtrar(e.target.value)}
        className={`${claseCampo} mt-1`}
      />
      {sinResultados ? <span className="mt-1 block text-amber-700">Ninguna fila coincide.</span> : null}
    </label>
  );
}
