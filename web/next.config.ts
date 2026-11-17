import type { NextConfig } from "next";

// La CSP de las páginas la pone proxy.ts con un nonce por petición. Las rutas que no pasan por el
// proxy (API y archivos estáticos) no sirven HTML: reciben una política que no permite nada.
const cspSinHtml = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

// Panel interno autenticado: todo es dinámico y por usuario, así que no se usa
// el caché de componentes. Nunca se debe cachear una respuesta con datos de pacientes.
const nextConfig: NextConfig = {
  cacheComponents: false,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: cspSinHtml }] },
    ];
  },
};

export default nextConfig;
