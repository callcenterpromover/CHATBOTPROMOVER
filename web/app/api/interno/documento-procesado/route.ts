// El worker de OCR avisa aquí cuando termina un documento, para escribirle al paciente si hay que
// pedirle algo. Protegido con un secreto compartido (WORKER_SECRET).

import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { avisarDocumentoProcesado } from "@/lib/bot/servicio";

export const dynamic = "force-dynamic";

function autorizado(cabecera: string | null) {
  const secreto = process.env.WORKER_SECRET;
  if (!secreto || secreto.length < 32 || !cabecera?.startsWith("Bearer ")) return false;
  const a = Buffer.from(cabecera.slice(7));
  const b = Buffer.from(secreto);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!autorizado(request.headers.get("authorization"))) {
    return new NextResponse("No autorizado", { status: 401 });
  }
  const cuerpo = (await request.json().catch(() => null)) as { trabajo_id?: unknown } | null;
  const id = Number(cuerpo?.trabajo_id);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse("Datos inválidos", { status: 400 });

  try {
    return NextResponse.json({ resultado: await avisarDocumentoProcesado(id) });
  } catch (e) {
    console.error("aviso_fallo", e instanceof Error ? e.message : "desconocido");
    return new NextResponse("Error", { status: 500 });
  }
}
