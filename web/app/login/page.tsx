import { claseBoton, claseCampo } from "@/app/componentes";
import { Notificaciones } from "@/components/Notificaciones";
import { CargaAlEnviar } from "@/components/PantallaCarga";
import { iniciarSesion } from "./actions";

export default async function PaginaLogin({ searchParams }: PageProps<"/login">) {
  const { error, expirada, salida } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Notificaciones
        avisos={[
          ...(expirada ? [{ tono: "info" as const, texto: "La sesión se cerró por inactividad. Ingresa de nuevo." }] : []),
          ...(error === "bloqueado"
            ? [{ tono: "error" as const, texto: "Demasiados intentos. Espera 15 minutos antes de volver a intentar." }]
            : error
              ? [{ tono: "error" as const, texto: "Correo o contraseña incorrectos." }]
              : []),
          ...(salida ? [{ tono: "ok" as const, texto: "Cerraste sesión correctamente." }] : []),
        ]}
      />
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold tracking-widest text-teal-700 uppercase">PROMOVER S.A.S.</p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">Lista de espera de citas</h1>
          <p className="mt-1 text-sm text-slate-500">Sede Cali · Acceso para personal autorizado</p>
        </div>

        <form action={iniciarSesion} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
          <CargaAlEnviar mensaje="Iniciando sesión de forma segura…" />
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              Correo
            </label>
            <input id="email" name="email" type="email" autoComplete="username" required className={claseCampo} />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={claseCampo}
            />
          </div>
          <button type="submit" className={`${claseBoton} w-full`}>
            Ingresar
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          Este panel contiene datos personales. No compartas tu usuario.
        </p>
      </div>
    </main>
  );
}
