import Link from "next/link";
import { inicioPorRol } from "@/lib/roles";
import { obtenerSesion } from "@/lib/supabase/server";

export default async function NoEncontrado() {
  // Sin redirigir: si hay sesión, el botón lleva a la pantalla principal del rol.
  const { operador } = await obtenerSesion();
  const destino = inicioPorRol(operador?.rol);
  const texto = !operador ? "Ir al inicio de sesión" : destino === "/dashboard" ? "Volver al dashboard" : "Volver a la lista de espera";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <p className="text-xs font-semibold tracking-widest text-teal-700 uppercase">PROMOVER S.A.S.</p>
        <p className="mt-4 text-6xl font-semibold text-teal-700 tabular-nums">404</p>
        <h1 className="mt-3 text-xl font-semibold text-slate-900">No encontramos esta página</h1>
        <p className="mt-2 text-sm text-slate-500">
          La dirección no existe o la solicitud ya fue gestionada y sus datos se eliminaron.
        </p>
        <Link
          href={destino}
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-800 active:scale-[0.98]"
        >
          {texto}
        </Link>
      </div>
    </main>
  );
}
