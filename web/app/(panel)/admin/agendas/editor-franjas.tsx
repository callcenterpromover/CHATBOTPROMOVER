"use client";

import { useMemo, useState } from "react";
import { claseBoton, claseBotonSecundario } from "@/app/componentes";
import { CargaAlEnviar } from "@/components/PantallaCarga";
import { DIAS, aHora, aMinutos, opcionesPaciente, validarFranjas, type FranjaEditable } from "@/lib/horarios";
import { M } from "@/lib/bot/mensajes";

type Props = {
  nombre: string;
  duracion: number;
  iniciales: FranjaEditable[];
  accion: (formData: FormData) => Promise<void>;
};

const ordenar = (lista: FranjaEditable[]) =>
  [...lista].sort((a, b) => a.dia - b.dia || aMinutos(a.inicio) - aMinutos(b.inicio));

/** Editor semanal: una fila por día con sus franjas de atención y la vista previa del bot. */
export function EditorFranjas({ nombre, duracion, iniciales, accion }: Props) {
  const [franjas, setFranjas] = useState(() => ordenar(iniciales));
  const [agregando, setAgregando] = useState<number | null>(null);
  const [nueva, setNueva] = useState({ inicio: "07:00", fin: "12:15" });
  const [errorNueva, setErrorNueva] = useState<string | null>(null);

  const cambiado = JSON.stringify(franjas) !== JSON.stringify(ordenar(iniciales));
  const error = validarFranjas(franjas, duracion);
  const opciones = useMemo(
    () => opcionesPaciente(franjas.map((f) => ({ dia_semana: f.dia, hora_inicio: f.inicio, hora_fin: f.fin })), duracion),
    [franjas, duracion],
  );

  function agregar(dia: number) {
    const lista = ordenar([...franjas, { dia, inicio: nueva.inicio, fin: nueva.fin }]);
    const problema = validarFranjas(lista, duracion);
    if (problema) {
      setErrorNueva(problema);
      return;
    }
    setFranjas(lista);
    setAgregando(null);
    setErrorNueva(null);
  }

  function copiarALunesViernes(dia: number) {
    // Lunes a viernes quedan iguales al día elegido; sábado y domingo no cambian.
    const delDia = franjas.filter((f) => f.dia === dia);
    const copia = [1, 2, 3, 4, 5].flatMap((d) => delDia.map((f) => ({ ...f, dia: d })));
    setFranjas(ordenar([...copia, ...franjas.filter((f) => f.dia > 5)]));
  }

  return (
    <form action={accion} className="space-y-4">
      <CargaAlEnviar mensaje="Guardando horario…" />
      <input type="hidden" name="franjas" value={JSON.stringify(franjas)} />

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {[1, 2, 3, 4, 5, 6, 7].map((dia) => {
          const delDia = franjas.filter((f) => f.dia === dia);
          return (
            <li key={dia} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center">
              <span className={`w-24 shrink-0 text-sm font-medium ${delDia.length ? "text-slate-800" : "text-slate-400"}`}>{DIAS[dia]}</span>
              <div className="flex flex-1 flex-wrap items-center gap-1.5">
                {delDia.length === 0 && agregando !== dia ? <span className="text-xs text-slate-400">Sin atención</span> : null}
                {delDia.map((f) => {
                  const ultima = aMinutos(f.fin) - duracion;
                  return (
                    <span
                      key={`${f.inicio}-${f.fin}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 py-1 pr-1 pl-2.5 text-xs text-teal-900 ring-1 ring-teal-600/20 ring-inset"
                    >
                      <span className="font-medium tabular-nums">
                        {f.inicio}–{f.fin}
                      </span>
                      <span className="text-teal-700/70 tabular-nums">· última {aHora(ultima)}</span>
                      <button
                        type="button"
                        onClick={() => setFranjas(franjas.filter((x) => x !== f))}
                        aria-label={`Quitar franja ${f.inicio} a ${f.fin} del ${DIAS[dia]}`}
                        className="grid size-5 place-items-center rounded-full text-teal-800 hover:bg-teal-100"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
                {agregando === dia ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <input
                      type="time"
                      step={300}
                      value={nueva.inicio}
                      onChange={(e) => setNueva({ ...nueva, inicio: e.target.value })}
                      aria-label="Hora de inicio"
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs tabular-nums"
                    />
                    <span className="text-xs text-slate-500">a</span>
                    <input
                      type="time"
                      step={300}
                      value={nueva.fin}
                      onChange={(e) => setNueva({ ...nueva, fin: e.target.value })}
                      aria-label="Hora final"
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs tabular-nums"
                    />
                    <button type="button" onClick={() => agregar(dia)} className="rounded-md bg-teal-700 px-2 py-1 text-xs font-medium text-white hover:bg-teal-800">
                      Añadir
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAgregando(null);
                        setErrorNueva(null);
                      }}
                      className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                    >
                      Cancelar
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAgregando(dia);
                      setErrorNueva(null);
                    }}
                    className="rounded-full px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50"
                  >
                    + Agregar franja
                  </button>
                )}
              </div>
              {delDia.length > 0 && dia <= 5 ? (
                <button
                  type="button"
                  onClick={() => copiarALunesViernes(dia)}
                  className="self-start rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 sm:self-auto"
                >
                  Copiar a lunes–viernes
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {errorNueva ? <p className="text-sm text-rose-700">{errorNueva}</p> : null}
      {error && !errorNueva ? <p className="text-sm text-rose-700">{error}</p> : null}

      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Así lo verá el paciente</p>
        <p className="mt-1.5 text-sm whitespace-pre-line text-slate-700">
          {opciones.length ? M.preferenciaOpciones(nombre, duracion, opciones) : M.preferencia}
        </p>
        {!opciones.length ? (
          <p className="mt-1 text-xs text-slate-500">Sin franjas: el bot pide la preferencia en texto libre.</p>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={!cambiado || !!error} className={`${claseBoton} disabled:cursor-not-allowed disabled:opacity-50`}>
          Guardar horario
        </button>
        {cambiado ? (
          <button type="button" onClick={() => setFranjas(ordenar(iniciales))} className={claseBotonSecundario}>
            Descartar cambios
          </button>
        ) : null}
        {cambiado ? <span className="text-xs text-amber-700">Cambios sin guardar</span> : null}
      </div>
    </form>
  );
}
