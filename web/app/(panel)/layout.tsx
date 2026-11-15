import Link from "next/link";
import { claseBotonSecundario } from "@/app/componentes";
import { cerrarSesion } from "@/app/login/actions";
import { CargaAlEnviar } from "@/components/PantallaCarga";
import { modoSimulacion } from "@/lib/bot/canal";
import { ROLES, esAdmin, inicioPorRol } from "@/lib/roles";
import { requerirSesion } from "@/lib/supabase/server";
import { Navegacion } from "./navegacion";

export default async function LayoutPanel({ children }: LayoutProps<"/">) {
  const { operador } = await requerirSesion();

  const enlaces = operador
    ? [
        { href: "/dashboard", texto: "Dashboard" },
        { href: "/lista-espera", texto: "Lista de espera" },
        ...(esAdmin(operador.rol) ? [{ href: "/admin/usuarios", texto: "Usuarios" }] : []),
        ...(modoSimulacion() ? [{ href: "/simulador", texto: "Simulador WhatsApp" }] : []),
      ]
    : [];

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href={inicioPorRol(operador?.rol)} className="flex items-baseline gap-2">
              <span className="text-sm font-semibold tracking-wide text-teal-700">PROMOVER</span>
              <span className="text-sm text-slate-500">Cali</span>
            </Link>
            <Navegacion enlaces={enlaces} />
          </div>
          <div className="flex items-center gap-3">
            {operador ? (
              <span className="hidden text-right text-sm leading-tight text-slate-600 sm:block">
                {operador.nombre}
                <span className="block text-xs text-slate-400">{ROLES[operador.rol]}</span>
              </span>
            ) : null}
            <form action={cerrarSesion}>
              <CargaAlEnviar mensaje="Cerrando sesión…" />
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
              Iniciaste sesión, pero tu cuenta no está habilitada en el panel. Pide a un administrador que te dé
              acceso.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
