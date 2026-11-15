import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { extraerMensajes, firmaValida } from "./whatsapp";

const SECRETO = "secreto-de-prueba";
const firmar = (cuerpo: string) => "sha256=" + createHmac("sha256", SECRETO).update(cuerpo).digest("hex");

describe("firma del webhook", () => {
  it("acepta la firma correcta y rechaza cualquier otra", () => {
    const cuerpo = JSON.stringify({ hola: 1 });
    expect(firmaValida(cuerpo, firmar(cuerpo), SECRETO)).toBe(true);
    expect(firmaValida(cuerpo + " ", firmar(cuerpo), SECRETO)).toBe(false);
    expect(firmaValida(cuerpo, "sha256=00", SECRETO)).toBe(false);
    expect(firmaValida(cuerpo, null, SECRETO)).toBe(false);
    expect(firmaValida(cuerpo, firmar(cuerpo), undefined)).toBe(false);
  });
});

const cuerpo = (messages: object[], phoneId = "111") => ({
  object: "whatsapp_business_account",
  entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: phoneId }, messages } }] }],
});

describe("lectura de mensajes", () => {
  it("convierte texto, imagen, documento, audio y otros", () => {
    const r = extraerMensajes(
      cuerpo([
        { id: "a", from: "573000000001", type: "text", text: { body: "Hola" } },
        { id: "b", from: "573000000001", type: "image", image: { id: "img-1" } },
        { id: "c", from: "573000000001", type: "document", document: { id: "doc-1" } },
        { id: "d", from: "573000000001", type: "audio", audio: { id: "aud-1" } },
        { id: "e", from: "573000000001", type: "sticker" },
      ]),
      "111",
    );
    expect(r.map((m) => m.entrada)).toEqual([
      { tipo: "texto", texto: "Hola" },
      { tipo: "media", mediaId: "img-1" },
      { tipo: "media", mediaId: "doc-1" },
      { tipo: "audio" },
      { tipo: "otro" },
    ]);
  });

  it("ignora mensajes de otro número de la cuenta y estados de entrega", () => {
    expect(extraerMensajes(cuerpo([{ id: "a", from: "573000000001", type: "text", text: { body: "x" } }], "999"), "111")).toEqual([]);
    const estados = { entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "111" }, statuses: [{}] } }] }] };
    expect(extraerMensajes(estados, "111")).toEqual([]);
    expect(extraerMensajes(null, "111")).toEqual([]);
  });
});
