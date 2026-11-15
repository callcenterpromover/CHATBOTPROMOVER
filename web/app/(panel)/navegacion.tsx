"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Enlace = { href: string; texto: string };

/** Menú principal; marca la sección actual. Los enlaces visibles dependen del rol (se calculan en el servidor). */
export function Navegacion({ enlaces }: { enlaces: Enlace[] }) {
  const ruta = usePathname();
  return (
    <nav aria-label="Secciones" className="flex flex-wrap items-center gap-1">
      {enlaces.map((e) => {
        const activo = ruta === e.href || ruta.startsWith(`${e.href}/`);
        return (
          <Link
            key={e.href}
            href={e.href}
            aria-current={activo ? "page" : undefined}
            className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
              activo ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {e.texto}
          </Link>
        );
      })}
    </nav>
  );
}
