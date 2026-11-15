import { NextResponse } from "next/server";
import { CATEGORIAS, EPS, ESTADOS, ESTADO_DOCUMENTAL, codigoSolicitud, etiqueta, type FilaLista } from "@/lib/catalogo";
import { requerirSesion } from "@/lib/supabase/server";

// Exportación mínima para la gestión del día. Sin diagnóstico, sin texto OCR, sin observaciones.
// El archivo descargado queda fuera del borrado automático: debe eliminarse al terminar la jornada.
function celda(v: string | number | null | undefined) {
  let t = v === null || v === undefined ? "" : String(v);
  // Evita que Excel interprete el contenido como fórmula.
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
}

export async function GET() {
  const { supabase, operador } = await requerirSesion();
  if (!operador) return new NextResponse("No autorizado", { status: 403 });

  const { data, error } = await supabase.from("lista_espera").select("*").order("creada_en", { ascending: true });
  if (error) return new NextResponse("No se pudo generar la exportación", { status: 500 });

  // Toda exportación queda en la auditoría (quién, cuándo y cuántas filas). Si no se puede
  // registrar, no se entrega el archivo.
  const { error: errorAuditoria } = await supabase.rpc("registrar_exportacion", { p_filas: data?.length ?? 0 });
  if (errorAuditoria) return new NextResponse("No se pudo registrar la exportación", { status: 500 });

  const encabezado = [
    "Solicitud",
    "Fecha de inicio",
    "Días de espera",
    "Nombre",
    "Documento",
    "Teléfono",
    "EPS",
    "Especialidad",
    "Servicio (orden)",
    "Estado",
    "Documentos",
    "Orden vence",
    "Días para vencer",
    "Alertas abiertas",
  ];
  const filas = ((data ?? []) as FilaLista[]).map((s) => [
    codigoSolicitud(s.numero),
    s.creada_en.slice(0, 10),
    s.dias_espera,
    s.nombre,
    s.documento,
    s.telefono,
    etiqueta(EPS, s.eps),
    etiqueta(CATEGORIAS, s.categoria_probable),
    s.servicio_texto,
    etiqueta(ESTADOS, s.estado),
    etiqueta(ESTADO_DOCUMENTAL, s.estado_documental),
    s.orden_vencimiento,
    s.dias_para_vencer,
    s.alertas_abiertas,
  ]);

  const csv = "﻿" + [encabezado, ...filas].map((f) => f.map(celda).join(";")).join("\r\n");
  const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lista-espera-${hoy}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
