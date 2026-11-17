// Webhook de WhatsApp vía Kapso (+57 317 6550770). Kapso envía `whatsapp.message.received` firmado
// con X-Webhook-Signature (HMAC-SHA256 hex del cuerpo crudo). Se responde 200 en menos de 10 s;
// si el procesamiento falla se responde 500 para que Kapso reintente (hasta 2 veces).

import { NextResponse, type NextRequest } from "next/server";
import { extraerMensajesKapso, firmaKapsoValida } from "@/lib/bot/kapso";
import { manejarEntrada } from "@/lib/bot/servicio";
import { crearClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const MAX_CUERPO = 512 * 1024;

export async function POST(request: NextRequest) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_CUERPO) {
    return new NextResponse("Demasiado grande", { status: 413 });
  }
  const cuerpo = await request.text();
  if (cuerpo.length > MAX_CUERPO) return new NextResponse("Demasiado grande", { status: 413 });

  if (!firmaKapsoValida(cuerpo, request.headers.get("x-webhook-signature"), process.env.KAPSO_WEBHOOK_SECRET)) {
    return new NextResponse("Firma inválida", { status: 401 });
  }

  // Solo interesan los mensajes entrantes; otros eventos se confirman y se ignoran.
  const evento = request.headers.get("x-webhook-event");
  if (evento && evento !== "whatsapp.message.received") return NextResponse.json({ ok: true, ignorado: evento });

  let json: unknown;
  try {
    json = JSON.parse(cuerpo);
  } catch {
    return new NextResponse("JSON inválido", { status: 400 });
  }

  const db = crearClienteAdmin();
  for (const m of extraerMensajesKapso(json, process.env.KAPSO_PHONE_NUMBER_ID)) {
    // Kapso reintenta: cada mensaje se procesa una sola vez.
    const clave = `kapso:${m.id}`;
    const { data: nuevo } = await db
      .from("mensajes_procesados")
      .upsert({ id: clave }, { onConflict: "id", ignoreDuplicates: true })
      .select("id");
    if (!nuevo?.length) continue;

    try {
      await manejarEntrada(m.telefono, m.entrada, "whatsapp");
    } catch (e) {
      // Se libera el ID para que el reintento lo procese. Sin datos del paciente en el registro.
      await db.from("mensajes_procesados").delete().eq("id", clave);
      console.error("kapso_webhook_fallo", e instanceof Error ? e.message : "desconocido");
      return new NextResponse("Error", { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
