import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_ACTIVIDAD, opcionesActividad, opcionesSeguras, sesionInactiva } from "@/lib/supabase/sesion";

// Refresca la sesión, cierra las sesiones inactivas y hace una comprobación rápida.
// La autorización real se verifica en cada página/acción (requerirSesion) y en la base (RLS).
const DESARROLLO = process.env.NODE_ENV !== "production";

/**
 * CSP con nonce por petición: solo se ejecutan los scripts que Next.js marca con el nonce, así una
 * inyección de HTML no puede correr código. Los estilos en línea se permiten (sin riesgo de ejecución).
 */
function politicaContenido(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${DESARROLLO ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${DESARROLLO ? " ws://localhost:* http://localhost:*" : ""}`,
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(DESARROLLO ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = politicaContenido(nonce);
  // Next.js lee el nonce de la cabecera CSP de la petición y lo aplica a sus scripts.
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);
  const siguiente = () => {
    const r = NextResponse.next({ request: { headers: request.headers } });
    r.headers.set("Content-Security-Policy", csp);
    return r;
  };
  let response = siguiente();

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
          response = siguiente();
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

// Webhooks (/api/whatsapp, /api/webhook) e /api/interno no usan sesión: se protegen con firmas y WORKER_SECRET.
export const config = {
  matcher: ["/((?!api/whatsapp|api/webhook|api/interno|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
