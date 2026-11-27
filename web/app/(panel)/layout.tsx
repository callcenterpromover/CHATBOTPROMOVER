import { cookies } from "next/headers";
import { Suspense } from "react";
import { Icono } from "@/components/Iconos";
import { cerrarSesion } from "@/app/login/actions";
import { CargaAlEnviar } from "@/components/PantallaCarga";
import { modoSimulacion } from "@/lib/bot/canal";
import { ROLES, esAdmin } from "@/lib/roles";
import { requerirSesion } from "@/lib/supabase/server";
import { InterruptorBot } from "./interruptor-bot";
import { IrASolicitud, Migas, MenuUsuario } from "./shell/barra-superior";
import { BarraLateral, CajonNavegacion, type GrupoNav } from "./shell/navegacion";

// Estructura del panel (docs/superpowers/specs/2026-11-24-rediseno-interfaz.md): barra lateral con el
// trabajo (colas), el seguimiento y la configuración; barra superior con ubicación, «ir a solicitud»,
// estado del bot y menú de usuario.
function haceUnDia() {
  return new Date(Date.now() - 86_400_000).toISOString();
}

export default async function LayoutPanel({ children }: LayoutProps<"/">) {
  const { supabase, user, operador } = await requerirSesion();
  const admin = esAdmin(operador?.rol);
  const superAdmin = operador?.rol === "super_admin";

  const [{ data: bot }, { data: asignaciones }, almacen, { count: erroresAbiertos }] = await Promise.all([
    superAdmin
      ? supabase.from("configuracion_bot").select("activo").eq("id", 1).maybeSingle()
      : Promise.resolve({ data: null }),
    operador ? supabase.from("solicitudes").select("asignado_a") : Promise.resolve({ data: [] }),
    cookies(),
    // Errores sin revisar en las últimas 24 h (si la tabla aún no existe, el conteo queda vacío).
    superAdmin
      ? supabase
          .from("registro_errores")
          .select("id", { count: "exact", head: true })
          .eq("revisado", false)
          .gte("ultimo_en", haceUnDia())
      : Promise.resolve({ count: null }),
  ]);
  const todas = (asignaciones ?? []) as { asignado_a: string | null }[];
  const conteo = {
    mia: todas.filter((s) => s.asignado_a === user.id).length,
    bolsa: todas.filter((s) => s.asignado_a === null).length,
    otros: todas.filter((s) => s.asignado_a !== null && s.asignado_a !== user.id).length,
  };

  const grupos: GrupoNav[] = operador
    ? [
        {
          titulo: "Trabajo",
          items: [
            { href: "/lista-espera?tab=mia", texto: "Mi bandeja", icono: "bandeja", conteo: conteo.mia, coincide: { ruta: "/lista-espera", param: "tab", valor: "mia", porDefecto: true } },
            { href: "/lista-espera?tab=bolsa", texto: "Por tomar", icono: "porTomar", conteo: conteo.bolsa, coincide: { ruta: "/lista-espera", param: "tab", valor: "bolsa" } },
            ...(admin
              ? [{ href: "/lista-espera?tab=otros", texto: "En gestión por otros", icono: "equipo" as const, conteo: conteo.otros, coincide: { ruta: "/lista-espera", param: "tab", valor: "otros" } }]
              : []),
          ],
        },
        {
          titulo: "Seguimiento",
          items: [{ href: "/dashboard", texto: "Indicadores", icono: "grafica", coincide: { ruta: "/dashboard" } }],
        },
        ...(admin
          ? [
              {
                titulo: "Configuración",
                items: [
                  {
                    href: "/admin/agendas",
                    texto: "Agendas",
                    icono: "calendario" as const,
                    coincide: { ruta: "/admin/agendas" },
                    hijos: [
                      { href: "/admin/agendas", texto: "Servicios y horarios", coincide: { ruta: "/admin/agendas", param: "v", valor: "servicios", porDefecto: true } },
                      { href: "/admin/agendas?v=sos", texto: "Agenda SOS", coincide: { ruta: "/admin/agendas", param: "v", valor: "sos" } },
                      { href: "/admin/agendas?v=reglas", texto: "Reglas y lineamientos", coincide: { ruta: "/admin/agendas", param: "v", valor: "reglas" } },
                    ],
                  },
                  { href: "/admin/usuarios", texto: "Usuarios", icono: "personas" as const, coincide: { ruta: "/admin/usuarios" } },
                  ...(superAdmin
                    ? [{ href: "/admin/errores", texto: "Registro de errores", icono: "alerta" as const, conteo: erroresAbiertos || undefined, coincide: { ruta: "/admin/errores" } }]
                    : []),
                ],
              },
            ]
          : []),
        ...(modoSimulacion()
          ? [{ titulo: "Herramientas", items: [{ href: "/simulador", texto: "Simulador de WhatsApp", icono: "chat" as const, coincide: { ruta: "/simulador" } }] }]
          : []),
      ]
    : [];

  const salir = (
    <form action={cerrarSesion}>
      <CargaAlEnviar mensaje="Cerrando sesión…" />
      <button
        type="submit"
        role="menuitem"
        className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-100"
      >
        <Icono nombre="salir" className="size-4 text-slate-500" />
        Cerrar sesión
      </button>
    </form>
  );
  const interruptor = superAdmin ? <InterruptorBot activoInicial={bot?.activo === true} /> : null;
  const rol = operador ? ROLES[operador.rol] : "";

  return (
    <div className="flex min-h-dvh">
      <Suspense fallback={<div className="hidden w-60 shrink-0 bg-tinta-900 lg:block" />}>
        <BarraLateral grupos={grupos} contraidaInicial={almacen.get("lateral")?.value === "contraida"} />
      </Suspense>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <div className="flex h-14 items-center gap-3 px-3 sm:px-5">
            <Suspense fallback={null}>
              <CajonNavegacion
                grupos={grupos}
                pie={
                  <div className="space-y-3 text-sm">
                    {interruptor}
                    {operador ? (
                      <div className="flex items-center justify-between gap-3">
                        <span className="leading-tight text-white">
                          {operador.nombre}
                          <span className="block text-xs text-tinta-300">{rol}</span>
                        </span>
                        <form action={cerrarSesion}>
                          <CargaAlEnviar mensaje="Cerrando sesión…" />
                          <button type="submit" className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white hover:bg-tinta-800">
                            Salir
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                }
              />
              <div className="min-w-0 flex-1">
                <Migas />
              </div>
            </Suspense>
            {operador ? <IrASolicitud /> : null}
            <div className="hidden items-center lg:flex">{interruptor}</div>
            {operador ? <MenuUsuario nombre={operador.nombre} rol={rol} salir={salir} /> : null}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-5 sm:px-6 sm:py-6">
          {operador ? (
            children
          ) : (
            <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
              <p className="font-semibold">Tu usuario todavía no está autorizado.</p>
              <p className="mt-1">
                Iniciaste sesión, pero tu cuenta no está habilitada en el panel. Pide a un administrador que te dé acceso.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
