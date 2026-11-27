// Webhook de WhatsApp vía Kapso (+57 317 6550770). Kapso envía `whatsapp.message.received` firmado
// con X-Webhook-Signature (HMAC-SHA256 hex del cuerpo crudo). Se responde 200 en menos de 10 s;
// si el procesamiento falla se responde 500 para que Kapso reintente (hasta 2 veces).

import { NextResponse, type NextRequest } from "next/server";
import { botActivo } from "@/lib/bot/estado";
import { claveLimite, dentroDelLimite } from "@/lib/limites";
import { extraerMensajesKapso, firmaKapsoValida, numerosDelEvento } from "@/lib/bot/kapso";
import { manejarEntrada, origenDeFallo } from "@/lib/bot/servicio";
import { finalDe, registrarError } from "@/lib/registro-errores";
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
    // Sin secreto configurado o con otro secreto, ningún mensaje pasa: se deja la causa en el registro.
    await registrarError("webhook", process.env.KAPSO_WEBHOOK_SECRET ? "firma_invalida" : "falta_KAPSO_WEBHOOK_SECRET");
    return new NextResponse("Firma inválida", { status: 401 });
  }

  // Solo interesan los mensajes entrantes; otros eventos se confirman y se ignoran.
  const evento = request.headers.get("x-webhook-event");
  if (evento && evento !== "whatsapp.message.received") {
    console.info("kapso_webhook_evento_ignorado", evento.slice(0, 60));
    return NextResponse.json({ ok: true, ignorado: evento });
  }

  let json: unknown;
  try {
    json = JSON.parse(cuerpo);
  } catch {
    await registrarError("webhook", "json_invalido");
    return new NextResponse("JSON inválido", { status: 400 });
  }

  const db = crearClienteAdmin();
  // Bot pausado por un super_admin: se confirma la entrega (sin reintentos) y no se responde ni se guarda nada.
  if (!(await botActivo(db))) {
    await registrarError("webhook", "bot_pausado");
    return NextResponse.json({ ok: true, pausado: true });
  }
  const mensajes = extraerMensajesKapso(json, process.env.KAPSO_PHONE_NUMBER_ID);
  if (!mensajes.length) {
    // Lo más común: KAPSO_PHONE_NUMBER_ID no coincide con el número que envía Kapso, o falta.
    const numeros = numerosDelEvento(json);
    const configurado = process.env.KAPSO_PHONE_NUMBER_ID;
    const motivo = !configurado
      ? "falta_KAPSO_PHONE_NUMBER_ID"
      : numeros.length && !numeros.includes(configurado)
        ? "phone_number_id_distinto"
        : "sin_mensajes_entrantes";
    if (motivo !== "sin_mensajes_entrantes") {
      await registrarError("webhook", motivo, `Llegó el ID de número ${numeros.map(finalDe).join(", ") || "ninguno"}; configurado: ${finalDe(configurado)}.`);
    }
    return NextResponse.json({ ok: true, procesados: 0, motivo });
  }
  let procesados = 0;
  for (const m of mensajes) {
    // Kapso reintenta: cada mensaje se procesa una sola vez.
    const clave = `kapso:${m.id}`;
    const { data: nuevo, error: errorRegistro } = await db
      .from("mensajes_procesados")
      .upsert({ id: clave }, { onConflict: "id", ignoreDuplicates: true })
      .select("id");
    if (errorRegistro) {
      // Sin este registro no se puede evitar procesar dos veces: se pide a Kapso que reintente.
      await registrarError("webhook", "registro_mensaje", errorRegistro.code ?? null);
      return new NextResponse("Error", { status: 500 });
    }
    if (!nuevo?.length) {
      console.info("kapso_webhook_duplicado");
      continue;
    }
    // Inundación desde un mismo número: más de 30 mensajes en 5 minutos se ignoran.
    if (!(await dentroDelLimite(claveLimite("wa", m.telefono), 30, 300))) {
      await registrarError("webhook", "limite_superado");
      continue;
    }

    try {
      await manejarEntrada(m.telefono, m.entrada, "whatsapp");
    } catch (e) {
      // Se libera el ID para que el reintento lo procese. Sin datos del paciente en el registro.
      await db.from("mensajes_procesados").delete().eq("id", clave);
      const codigo = e instanceof Error ? e.message : "desconocido";
      await registrarError(origenDeFallo(codigo), codigo, "Kapso reintentará el mensaje.");
      return new NextResponse("Error", { status: 500 });
    }
    procesados++;
  }
  return NextResponse.json({ ok: true, procesados });
}
