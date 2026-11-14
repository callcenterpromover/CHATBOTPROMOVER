import { claseBoton, claseCampo } from "@/app/componentes";
import { iniciarSesion } from "./actions";

export default async function PaginaLogin({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold tracking-widest text-teal-700 uppercase">PROMOVER S.A.S.</p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">Lista de espera de citas</h1>
          <p className="mt-1 text-sm text-slate-500">Sede Cali · Acceso para personal autorizado</p>
        </div>

        <form action={iniciarSesion} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
          {error ? (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
              Correo o contraseña incorrectos.
            </p>
          ) : null}
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
