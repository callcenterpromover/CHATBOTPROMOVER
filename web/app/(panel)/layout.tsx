import Link from "next/link";
import { claseBotonSecundario } from "@/app/componentes";
import { cerrarSesion } from "@/app/login/actions";
import { CargaAlEnviar } from "@/components/PantallaCarga";
import { modoSimulacion } from "@/lib/bot/canal";
import { ROLES, esAdmin, inicioPorRol } from "@/lib/roles";
import { requerirSesion } from "@/lib/supabase/server";
import { InterruptorBot } from "./interruptor-bot";
import { MenuMovil } from "./menu-movil";
import { Navegacion } from "./navegacion";

export default async function LayoutPanel({ children }: LayoutProps<"/">) {
  const { supabase, operador } = await requerirSesion();
  const superAdmin = operador?.rol === "super_admin";
  const { data: bot } = superAdmin
    ? await supabase.from("configuracion_bot").select("activo").eq("id", 1).maybeSingle()
    : { data: null };

  const enlaces = operador
    ? [
        { href: "/dashboard", texto: "Dashboard" },
        { href: "/lista-espera", texto: "Lista de espera" },
        ...(esAdmin(operador.rol)
          ? [
              { href: "/admin/agendas", texto: "Agendas" },
              { href: "/admin/usuarios", texto: "Usuarios" },
            ]
          : []),
        ...(modoSimulacion() ? [{ href: "/simulador", texto: "Simulador WhatsApp" }] : []),
      ]
    : [];

  const salir = (
    <form action={cerrarSesion}>
      <CargaAlEnviar mensaje="Cerrando sesión…" />
      <button type="submit" className={claseBotonSecundario}>
        Salir
      </button>
    </form>
  );
  const interruptor = superAdmin ? <InterruptorBot activoInicial={bot?.activo === true} /> : null;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="relative mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-6">
            <Link href={inicioPorRol(operador?.rol)} className="flex shrink-0 items-baseline gap-1.5">
              <span className="text-sm font-semibold tracking-wide text-teal-700">PROMOVER</span>
              <span className="text-sm text-slate-500">Cali</span>
            </Link>
            <div className="hidden lg:block">
              <Navegacion enlaces={enlaces} />
            </div>
          </div>
          <div className="hidden items-center gap-3 lg:flex">
            {interruptor}
            {operador ? (
              <span className="text-right text-sm leading-tight text-slate-600">
                {operador.nombre}
                <span className="block text-xs text-slate-500">{ROLES[operador.rol]}</span>
              </span>
            ) : null}
            {salir}
          </div>
          <MenuMovil
            enlaces={enlaces}
            pie={
              <div className="space-y-3">
                {interruptor}
                <div className="flex items-center justify-between gap-3">
                  {operador ? (
                    <span className="text-sm leading-tight text-slate-700">
                      {operador.nombre}
                      <span className="block text-xs text-slate-500">{ROLES[operador.rol]}</span>
                    </span>
                  ) : (
                    <span />
                  )}
                  {salir}
                </div>
              </div>
            }
          />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6">
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
