import Link from "next/link";
import { notFound } from "next/navigation";
import { claseBoton, claseBotonSecundario, claseCampo } from "@/app/componentes";
import { modoSimulacion } from "@/lib/bot/estado";
import { codigoSolicitud, etiqueta, ESTADOS } from "@/lib/catalogo";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { requerirSesion } from "@/lib/supabase/server";
import { enviarAudio, enviarDocumento, enviarTexto, reiniciar } from "./actions";
import { AutoRefresco } from "@/components/AutoRefresco";
import { Notificaciones } from "@/components/Notificaciones";
import { DOCUMENTOS_FICTICIOS } from "./documentos";

const fmtHora = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", timeStyle: "short" });

// Convierte *negrita* de WhatsApp en <strong> sin interpretar HTML.
function ConFormato({ texto }: { texto: string }) {
  return texto.split(/(\*[^*\n]+\*)/g).map((parte, i) =>
    parte.startsWith("*") && parte.endsWith("*") && parte.length > 2 ? (
      <strong key={i}>{parte.slice(1, -1)}</strong>
    ) : (
      <span key={i}>{parte}</span>
    ),
  );
}

export default async function PaginaSimulador({ searchParams }: PageProps<"/simulador">) {
  const { operador } = await requerirSesion();
  if (!operador) return null;
  const db = crearClienteAdmin();
  if (!(await modoSimulacion(db))) notFound();

  const sp = await searchParams;
  const tel = typeof sp.tel === "string" && /^5730000000\d{2}$/.test(sp.tel) ? sp.tel : "573000000099";
  const [{ data: mensajes }, { data: conv }] = await Promise.all([
    db.from("mensajes_simulador").select("id, direccion, texto, creado_en").eq("telefono", tel).order("id").limit(300),
    db.from("conversaciones").select("paso, solicitud_id").eq("telefono", tel).maybeSingle(),
  ]);
  const { data: solicitud } = conv?.solicitud_id
    ? await db.from("solicitudes").select("id, numero, estado").eq("id", conv.solicitud_id).maybeSingle()
    : { data: null };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <AutoRefresco />
      <Notificaciones
        avisos={
          sp.error
            ? [{ tono: "error", texto: "El bot no pudo procesar el último mensaje. Revisa la configuración (clave secreta en el servidor)." }]
            : []
        }
      />
      <section className="flex h-[calc(100vh-10rem)] min-h-[480px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-teal-700 px-4 py-3 text-white">
          <div>
            <p className="text-sm font-semibold">PROMOVER S.A.S. (simulado)</p>
            <p className="text-xs text-teal-100">Paciente: +{tel}</p>
          </div>
          <form action={reiniciar.bind(null, tel)}>
            <button type="submit" className="rounded-md bg-white/15 px-2.5 py-1 text-xs font-medium hover:bg-white/25">
              Reiniciar chat
            </button>
          </form>
        </header>

        <div className="flex flex-1 flex-col-reverse overflow-y-auto bg-[#efeae2] px-4 py-4">
          <ol className="space-y-2">
            {(mensajes ?? []).length === 0 ? (
              <li className="mx-auto max-w-sm rounded-lg bg-white/80 px-3 py-2 text-center text-xs text-slate-600">
                Escribe un mensaje como si fueras el paciente, por ejemplo «Hola».
              </li>
            ) : null}
            {(mensajes ?? []).map((m) => {
              const propio = m.direccion === "ENTRANTE";
              return (
                <li key={m.id} className={`flex ${propio ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm whitespace-pre-wrap text-slate-900 shadow-sm ${
                      propio ? "bg-[#d9fdd3]" : "bg-white"
                    }`}
                  >
                    <ConFormato texto={m.texto} />
                    <span className="ml-2 align-bottom text-[10px] text-slate-500">{fmtHora.format(new Date(m.creado_en))}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <footer className="border-t border-slate-200 bg-slate-50 p-3">
          <form action={enviarTexto.bind(null, tel)} className="flex gap-2">
            <input
              name="texto"
              required
              autoFocus
              autoComplete="off"
              maxLength={1000}
              placeholder="Escribe un mensaje"
              aria-label="Mensaje del paciente"
              className={claseCampo}
            />
            <button type="submit" className={claseBoton}>
              Enviar
            </button>
          </form>
          <div className="mt-2 flex flex-wrap gap-2">
            <form action={enviarDocumento.bind(null, tel)} className="flex flex-1 gap-2">
              <select name="documento" aria-label="Documento ficticio" className={`${claseCampo} min-w-0`}>
                {DOCUMENTOS_FICTICIOS.map((d) => (
                  <option key={d.archivo} value={d.archivo}>
                    {d.texto}
                  </option>
                ))}
              </select>
              <button type="submit" className={`${claseBotonSecundario} shrink-0 gap-1.5`}>
                <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13.5 6.5l-5.8 5.8a1.6 1.6 0 002.3 2.3l6-6a3.2 3.2 0 00-4.5-4.5l-6.2 6.2a4.8 4.8 0 006.8 6.8l5.2-5.2" />
                </svg>
                Adjuntar
              </button>
            </form>
            <form action={enviarAudio.bind(null, tel)}>
              <button type="submit" className={`${claseBotonSecundario} gap-1.5`}>
                <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <rect x="7" y="2.5" width="6" height="10" rx="3" />
                  <path d="M4.5 9.5a5.5 5.5 0 0011 0M10 15v2.5" />
                </svg>
                Audio
              </button>
            </form>
          </div>
        </footer>
      </section>

      <aside className="space-y-4 text-sm">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p className="font-semibold">Simulador de WhatsApp</p>
          <p className="mt-1">
            Prueba la conversación del bot sin la API de Meta. Usa solo datos ficticios. Los documentos son los de prueba
            del worker: para que se lean, el worker debe estar corriendo en este equipo.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Paso actual del bot</p>
          <p className="mt-0.5 font-mono text-sm text-slate-900">{conv?.paso ?? "INICIO"}</p>
          <p className="mt-3 text-xs text-slate-500">Solicitud</p>
          {solicitud ? (
            <p className="mt-0.5">
              <Link href={`/solicitudes/${solicitud.id}`} className="font-medium text-teal-700 hover:underline">
                {codigoSolicitud(solicitud.numero)}
              </Link>{" "}
              <span className="text-slate-600">· {etiqueta(ESTADOS, solicitud.estado)}</span>
            </p>
          ) : (
            <p className="mt-0.5 text-slate-600">Aún no se ha creado</p>
          )}
        </div>

        <form method="get" className="rounded-xl border border-slate-200 bg-white p-4">
          <label className="block text-xs text-slate-500">
            Simular otro número (ficticio: 5730000000 + 2 dígitos)
            <input name="tel" defaultValue={tel} pattern="5730000000\d{2}" className={`${claseCampo} mt-1 font-mono`} />
          </label>
          <button type="submit" className={`${claseBotonSecundario} mt-2 w-full`}>
            Cambiar
          </button>
        </form>
      </aside>
    </div>
  );
}
