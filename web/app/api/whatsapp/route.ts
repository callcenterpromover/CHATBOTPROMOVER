// Webhook de WhatsApp (Meta Cloud API). Listo para conectar cuando exista la cuenta:
// configurar META_VERIFY_TOKEN, META_APP_SECRET, META_PHONE_NUMBER_ID y META_WHATSAPP_TOKEN.

import { NextResponse, type NextRequest } from "next/server";
import { botActivo } from "@/lib/bot/estado";
import { claveLimite, dentroDelLimite } from "@/lib/limites";
import { manejarEntrada } from "@/lib/bot/servicio";
import { extraerMensajes, firmaValida } from "@/lib/bot/whatsapp";
import { crearClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Verificación que hace Meta al registrar el webhook.
export function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const token = process.env.META_VERIFY_TOKEN;
  if (token && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === token) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Prohibido", { status: 403 });
}

const MAX_CUERPO = 512 * 1024; // los webhooks de Meta pesan pocos KB

export async function POST(request: NextRequest) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_CUERPO) {
    return new NextResponse("Demasiado grande", { status: 413 });
  }
  const cuerpo = await request.text();
  if (cuerpo.length > MAX_CUERPO) return new NextResponse("Demasiado grande", { status: 413 });
  if (!firmaValida(cuerpo, request.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET)) {
    return new NextResponse("Firma inválida", { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(cuerpo);
  } catch {
    return new NextResponse("JSON inválido", { status: 400 });
  }

  const db = crearClienteAdmin();
  // Bot pausado por un super_admin: se confirma la entrega (sin reintentos) y no se responde ni se guarda nada.
  if (!(await botActivo(db))) return NextResponse.json({ ok: true, pausado: true });
  for (const m of extraerMensajes(json, process.env.META_PHONE_NUMBER_ID)) {
    // Meta reintenta: cada mensaje se procesa una sola vez.
    const { data: nuevo } = await db
      .from("mensajes_procesados")
      .upsert({ id: m.id }, { onConflict: "id", ignoreDuplicates: true })
      .select("id");
    if (!nuevo?.length) continue;
    // Inundación desde un mismo número: más de 30 mensajes en 5 minutos se ignoran.
    if (!(await dentroDelLimite(claveLimite("wa", m.telefono), 30, 300))) continue;

    try {
      await manejarEntrada(m.telefono, m.entrada, "whatsapp");
    } catch (e) {
      // Se libera el ID para que el reintento de Meta lo procese. Sin datos del paciente en el log.
      await db.from("mensajes_procesados").delete().eq("id", m.id);
      console.error("webhook_fallo", e instanceof Error ? e.message : "desconocido");
      return new NextResponse("Error", { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
