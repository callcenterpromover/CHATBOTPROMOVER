"use client";

import { useRouter } from "next/navigation";
import { claseCampo } from "@/app/componentes";

type Grupo = { eps: string; servicios: { id: number; nombre: string }[] };

/** En pantallas pequeñas la lista de servicios se reemplaza por un selector. */
export function SelectorServicio({ grupos, actual }: { grupos: Grupo[]; actual: string }) {
  const router = useRouter();
  return (
    <label className="block text-xs font-medium text-slate-600 lg:hidden">
      Servicio
      <select
        value={actual}
        onChange={(e) => router.push(`/admin/agendas?s=${e.target.value}`)}
        className={`${claseCampo} mt-1`}
      >
        {grupos.map((g) => (
          <optgroup key={g.eps} label={g.eps}>
            {g.servicios.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.nombre}
              </option>
            ))}
          </optgroup>
        ))}
        <option value="nuevo">+ Nuevo servicio</option>
      </select>
    </label>
  );
}
