import type { ReactNode } from "react";
import { requerirRol } from "@/lib/supabase/server";
import { Interruptor } from "./interruptor";

const TELEFONO = "+57 317 6550770";

type Config = { activo: boolean; ocr_activo: boolean; simulacion: boolean };
type Worker = { worker_estado?: "ENCENDIDO" | "APAGADO" | "SIN_SENAL" | "NUNCA"; worker_equipo?: string | null; ocr_pendientes?: number };

const ESTADO_EQUIPO: Record<NonNullable<Worker["worker_estado"]>, string> = {
  ENCENDIDO: "El programa del OCR está corriendo",
  APAGADO: "El programa del OCR está cerrado",
  SIN_SENAL: "El equipo del OCR no envía señal (apagado o sin internet)",
  NUNCA: "El programa del OCR nunca se ha conectado",
};

function Fila({ titulo, descripcion, detalle, control }: { titulo: string; descripcion: string; detalle?: ReactNode; control: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
        <p className="mt-1 max-w-prose text-sm text-slate-600">{descripcion}</p>
        {detalle ? <p className="mt-2 text-xs text-slate-500">{detalle}</p> : null}
      </div>
      {control}
    </section>
  );
}

export default async function PaginaConfiguracion() {
  const { supabase } = await requerirRol(["super_admin"]);
  const [{ data: config }, { data: resumen }] = await Promise.all([
    supabase.from("configuracion_bot").select("activo, ocr_activo, simulacion").eq("id", 1).maybeSingle<Config>(),
    supabase.rpc("resumen_espera"),
  ]);
  const w = (resumen ?? {}) as Worker;
  const equipo = w.worker_estado ? `${ESTADO_EQUIPO[w.worker_estado]}${w.worker_equipo ? ` en ${w.worker_equipo}` : ""}` : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.01em] text-slate-900">Configuraciones</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Encender o apagar el bot, el lector de documentos y el modo simulación. Solo los super administradores ven esta
          página; cada cambio pide confirmación y queda en la auditoría.
        </p>
      </div>

      {!config ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No se pudo leer la configuración. Revisa que la migración <code>20261128000000_configuraciones.sql</code> esté
          aplicada en Supabase.
        </p>
      ) : (
        <>
          <Fila
            titulo="Bot de WhatsApp"
            descripcion={`Responde automáticamente a los pacientes que escriben al ${TELEFONO} y registra sus solicitudes en la lista de espera.`}
            control={
              <Interruptor
                clave="bot"
                activoInicial={config.activo}
                textos={{
                  encendido: "Activo",
                  apagado: "Pausado",
                  confirmarEncender: {
                    titulo: "¿Encender el bot de WhatsApp?",
                    detalle: `El bot empezará a responder automáticamente a los pacientes que escriban al ${TELEFONO} y a registrar sus solicitudes.`,
                    boton: "Sí, encender",
                  },
                  confirmarApagar: {
                    titulo: "¿Pausar el bot de WhatsApp?",
                    detalle: `Los pacientes que escriban al ${TELEFONO} no recibirán respuestas automáticas y sus mensajes no se registrarán en la lista de espera. El equipo deberá atenderlos directamente.`,
                    boton: "Sí, pausar",
                  },
                }}
              />
            }
          />

          <Fila
            titulo="Lector de documentos (OCR)"
            descripcion="Lee las órdenes, historias y planes que envían los pacientes. Pausado, el programa del equipo de la sede sigue abierto pero no toma documentos: quedan en cola y se leen al reanudar."
            detalle={
              <>
                {equipo ? `${equipo}. ` : ""}
                {Number(w.ocr_pendientes ?? 0)} documento(s) en cola. Para cerrar o abrir el programa, usa el control del
                equipo de la sede.
              </>
            }
            control={
              <Interruptor
                clave="ocr"
                activoInicial={config.ocr_activo}
                textos={{
                  encendido: "Activo",
                  apagado: "Pausado",
                  confirmarEncender: {
                    titulo: "¿Reanudar el OCR?",
                    detalle: "El lector volverá a tomar los documentos en cola. Debe estar abierto el programa del OCR en el equipo de la sede.",
                    boton: "Sí, reanudar",
                  },
                  confirmarApagar: {
                    titulo: "¿Pausar el OCR?",
                    detalle: "Los documentos que lleguen quedarán en cola sin leer y el bot no podrá confirmar a los pacientes que su solicitud está completa hasta que lo reanudes.",
                    boton: "Sí, pausar",
                  },
                }}
              />
            }
          />

          <Fila
            titulo="Modo simulación"
            descripcion="Muestra el simulador de WhatsApp en el menú para probar el bot con números ficticios, sin escribirle a pacientes reales. Apágalo cuando no se esté probando."
            control={
              <Interruptor
                clave="simulacion"
                activoInicial={config.simulacion}
                textos={{
                  encendido: "Encendido",
                  apagado: "Apagado",
                  confirmarEncender: {
                    titulo: "¿Encender el modo simulación?",
                    detalle: "Todos los usuarios del panel verán el simulador de WhatsApp. Solo usa números ficticios (5730000000xx) y no afecta a los pacientes reales.",
                    boton: "Sí, encender",
                  },
                  confirmarApagar: {
                    titulo: "¿Apagar el modo simulación?",
                    detalle: "El simulador de WhatsApp dejará de estar disponible. Las conversaciones de prueba no se borran.",
                    boton: "Sí, apagar",
                  },
                }}
              />
            }
          />
        </>
      )}
    </div>
  );
}
