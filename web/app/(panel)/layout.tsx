import Link from "next/link";
import { claseBotonSecundario } from "@/app/componentes";
import { cerrarSesion } from "@/app/login/actions";
import { modoSimulacion } from "@/lib/bot/canal";
import { requerirSesion } from "@/lib/supabase/server";

export default async function LayoutPanel({ children }: LayoutProps<"/">) {
  const { operador } = await requerirSesion();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-sm font-semibold tracking-wide text-teal-700">PROMOVER</span>
            <span className="text-sm text-slate-500">Lista de espera · Cali</span>
          </Link>
          <div className="flex items-center gap-3">
            {operador && modoSimulacion() ? (
              <Link href="/simulador" className="text-sm font-medium text-teal-700 hover:underline">
                Simulador WhatsApp
              </Link>
            ) : null}
            {operador ? <span className="hidden text-sm text-slate-600 sm:inline">{operador.nombre}</span> : null}
            <form action={cerrarSesion}>
              <button type="submit" className={claseBotonSecundario}>
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {operador ? (
          children
        ) : (
          <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
            <p className="font-semibold">Tu usuario todavía no está autorizado.</p>
            <p className="mt-1">
              Iniciaste sesión, pero tu cuenta no está en la lista de operadores del panel. Pide al
              administrador que te habilite.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
