// Íconos del panel: un solo trazo (1.75 px), 20×20, heredan el color del texto.
import type { SVGProps } from "react";

export type NombreIcono =
  | "bandeja"
  | "porTomar"
  | "equipo"
  | "grafica"
  | "calendario"
  | "personas"
  | "chat"
  | "contraer"
  | "expandir"
  | "menu"
  | "cerrar"
  | "buscar"
  | "salir"
  | "anterior"
  | "siguiente"
  | "check"
  | "falta"
  | "alerta"
  | "flecha";

const TRAZOS: Record<NombreIcono, React.ReactNode> = {
  bandeja: (
    <>
      <path d="M3.5 11.5 5.6 4.8A1.5 1.5 0 0 1 7 3.75h6a1.5 1.5 0 0 1 1.4 1.05l2.1 6.7" />
      <path d="M3.5 11.5v3.25c0 .83.67 1.5 1.5 1.5h10c.83 0 1.5-.67 1.5-1.5V11.5h-3.6l-1 1.75H8.1l-1-1.75H3.5Z" />
    </>
  ),
  porTomar: (
    <>
      <rect x="3.25" y="3.25" width="13.5" height="13.5" rx="2.5" />
      <path d="M10 6.75v6.5M6.75 10h6.5" />
    </>
  ),
  equipo: (
    <>
      <circle cx="7.25" cy="7" r="2.5" />
      <path d="M2.75 16c.4-2.4 2.2-4 4.5-4s4.1 1.6 4.5 4" />
      <path d="M12.75 4.75a2.5 2.5 0 0 1 0 4.5M14.5 12.2c1.3.5 2.4 1.8 2.75 3.8" />
    </>
  ),
  grafica: (
    <>
      <path d="M3.5 16.5h13" />
      <path d="M6 13.5V9M10 13.5V5.5M14 13.5v-6" />
    </>
  ),
  calendario: (
    <>
      <rect x="3.25" y="4.5" width="13.5" height="12" rx="2" />
      <path d="M3.25 8.25h13.5M7 3v3M13 3v3" />
    </>
  ),
  personas: (
    <>
      <circle cx="10" cy="7" r="3" />
      <path d="M4.25 16.5c.6-3 2.95-4.75 5.75-4.75s5.15 1.75 5.75 4.75" />
    </>
  ),
  chat: (
    <path d="M4 15.5V6.25c0-.97.78-1.75 1.75-1.75h8.5c.97 0 1.75.78 1.75 1.75v5.5c0 .97-.78 1.75-1.75 1.75H7.25L4 15.5Z" />
  ),
  contraer: (
    <>
      <rect x="3.25" y="3.25" width="13.5" height="13.5" rx="2.5" />
      <path d="M7.75 3.5v13M12.5 8 10.5 10l2 2" />
    </>
  ),
  expandir: (
    <>
      <rect x="3.25" y="3.25" width="13.5" height="13.5" rx="2.5" />
      <path d="M7.75 3.5v13M11 8l2 2-2 2" />
    </>
  ),
  menu: <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />,
  cerrar: <path d="M5 5l10 10M15 5 5 15" />,
  buscar: (
    <>
      <circle cx="9" cy="9" r="5" />
      <path d="m16.5 16.5-3.9-3.9" />
    </>
  ),
  salir: (
    <>
      <path d="M8 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
      <path d="M12.5 13.5 16 10l-3.5-3.5M16 10H8" />
    </>
  ),
  anterior: <path d="M12 5 7 10l5 5" />,
  siguiente: <path d="m8 5 5 5-5 5" />,
  check: <path d="m4.75 10.5 3.25 3.25 7.25-7.5" />,
  falta: (
    <>
      <circle cx="10" cy="10" r="6.75" />
      <path d="M10 6.5v4.25M10 13.4v.1" />
    </>
  ),
  alerta: (
    <>
      <path d="M8.7 3.9 2.9 14a1.5 1.5 0 0 0 1.3 2.25h11.6A1.5 1.5 0 0 0 17.1 14L11.3 3.9a1.5 1.5 0 0 0-2.6 0Z" />
      <path d="M10 8v3.25M10 13.9v.1" />
    </>
  ),
  flecha: <path d="m7.5 5 5 5-5 5" />,
};

export function Icono({ nombre, className = "size-5", ...props }: { nombre: NombreIcono } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {TRAZOS[nombre]}
    </svg>
  );
}
