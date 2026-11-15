import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_ACTIVIDAD, opcionesActividad, opcionesSeguras, sesionInactiva } from "@/lib/supabase/sesion";

// Refresca la sesión, cierra las sesiones inactivas y hace una comprobación rápida.
// La autorización real se verifica en cada página/acción (requerirSesion) y en la base (RLS).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(lista) {
          lista.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          lista.forEach(({ name, value, options }) => response.cookies.set(name, value, opcionesSeguras(options)));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  let autenticado = Boolean(data?.claims);
  const ruta = request.nextUrl.pathname;

  const redirigir = (destino: string, parametros = "") => {
    const url = request.nextUrl.clone();
    url.pathname = destino;
    url.search = parametros;
    const redireccion = NextResponse.redirect(url);
    // Conserva las cookies que se hayan actualizado o borrado en esta petición.
    response.cookies.getAll().forEach((c) => redireccion.cookies.set(c));
    return redireccion;
  };

  // Cierre por inactividad: datos de salud no deben quedar abiertos en un equipo desatendido.
  if (autenticado && sesionInactiva(request.cookies.get(COOKIE_ACTIVIDAD)?.value)) {
    await supabase.auth.signOut();
    response.cookies.delete(COOKIE_ACTIVIDAD);
    autenticado = false;
    if (!ruta.startsWith("/login")) return redirigir("/login", "?expirada=1");
  }

  if (!autenticado && !ruta.startsWith("/login")) return redirigir("/login");
  if (autenticado && ruta === "/login") return redirigir("/");

  if (autenticado) response.cookies.set(COOKIE_ACTIVIDAD, String(Date.now()), opcionesActividad);
  return response;
}

// /api/whatsapp y /api/interno no usan sesión: se protegen con la firma de Meta y con WORKER_SECRET.
export const config = {
  matcher: ["/((?!api/whatsapp|api/interno|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
