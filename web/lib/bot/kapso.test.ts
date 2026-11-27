import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { extraerMensajesKapso, firmaKapsoValida } from "./kapso";

const SECRETO = "secreto-de-prueba";
const firmar = (cuerpo: string) => createHmac("sha256", SECRETO).update(cuerpo).digest("hex");

describe("firma de Kapso", () => {
  it("acepta la firma hex correcta y rechaza cualquier otra", () => {
    const cuerpo = JSON.stringify({ message: { id: "1" } });
    expect(firmaKapsoValida(cuerpo, firmar(cuerpo), SECRETO)).toBe(true);
    expect(firmaKapsoValida(cuerpo + " ", firmar(cuerpo), SECRETO)).toBe(false);
    expect(firmaKapsoValida(cuerpo, "sha256=" + firmar(cuerpo), SECRETO)).toBe(false);
    expect(firmaKapsoValida(cuerpo, "00", SECRETO)).toBe(false);
    expect(firmaKapsoValida(cuerpo, null, SECRETO)).toBe(false);
    expect(firmaKapsoValida(cuerpo, firmar(cuerpo), undefined)).toBe(false); // sin secreto: rechaza todo
  });
});

const evento = (message: object, extra: object = {}) => ({
  message: { kapso: { direction: "inbound" }, ...message },
  conversation: { phone_number: "+57 300 000 0001", phone_number_id: "111" },
  phone_number_id: "111",
  ...extra,
});

describe("mensajes de Kapso", () => {
  it("convierte texto, imagen, documento, audio y otros", () => {
    const r = [
      evento({ id: "a", from: "573000000001", type: "text", text: { body: "Hola" } }),
      evento({ id: "b", from: "573000000001", type: "image", image: { id: "1234567890" } }),
      evento({ id: "c", from: "573000000001", type: "document", document: { id: "9876543210" } }),
      evento({ id: "d", from: "573000000001", type: "audio", audio: { id: "555555" } }),
      evento({ id: "e", from: "573000000001", type: "location" }),
    ].flatMap((e) => extraerMensajesKapso(e, "111"));
    expect(r.map((m) => m.entrada)).toEqual([
      { tipo: "texto", texto: "Hola" },
      { tipo: "media", mediaId: "kapso:1234567890" },
      { tipo: "media", mediaId: "kapso:9876543210" },
      { tipo: "audio" },
      { tipo: "otro" },
    ]);
  });

  it("lee el formato en lote", () => {
    const lote = { type: "whatsapp.message.received", batch: true, data: [
      evento({ id: "a", from: "573000000001", type: "text", text: { body: "uno" } }),
      evento({ id: "b", from: "573000000001", type: "text", text: { body: "dos" } }),
    ] };
    expect(extraerMensajesKapso(lote, "111").map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("usa el teléfono de la conversación si falta el remitente y lo normaliza", () => {
    const [m] = extraerMensajesKapso(evento({ id: "a", type: "text", text: { body: "x" } }), "111");
    expect(m.telefono).toBe("573000000001");
  });

  it("ignora otros números, mensajes salientes e IDs de medio inválidos", () => {
    expect(extraerMensajesKapso(evento({ id: "a", from: "573000000001", type: "text", text: { body: "x" } }), "999")).toEqual([]);
    const saliente = evento({ id: "a", from: "573000000001", type: "text", text: { body: "x" }, kapso: { direction: "outbound" } });
    expect(extraerMensajesKapso(saliente, "111")).toEqual([]);
    const raro = extraerMensajesKapso(evento({ id: "a", from: "573000000001", type: "image", image: { id: "../x" } }), "111");
    expect(raro[0].entrada).toEqual({ tipo: "otro" });
    expect(extraerMensajesKapso(null, "111")).toEqual([]);
  });
});

describe("numerosDelEvento", () => {
  it("devuelve los phone_number_id del evento, sin repetir", async () => {
    const { numerosDelEvento } = await import("./kapso");
    expect(numerosDelEvento({ phone_number_id: "123456", message: { id: "a" } })).toEqual(["123456"]);
    expect(
      numerosDelEvento({ batch: true, data: [{ phone_number_id: "111111" }, { conversation: { phone_number_id: "111111" } }] }),
    ).toEqual(["111111"]);
    expect(numerosDelEvento({})).toEqual([]);
  });
});
