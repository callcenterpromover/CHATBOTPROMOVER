import { describe, expect, it } from "vitest";
import { agrupar } from "./canal";

describe("agrupar respuestas", () => {
  it("junta todo el turno en un solo mensaje", () => {
    expect(agrupar(["Hola", "¿Cuál es tu cédula?"])).toEqual(["Hola\n\n¿Cuál es tu cédula?"]);
  });
  it("descarta vacíos", () => expect(agrupar(["", "  "])).toEqual([]));
  it("parte solo si se pasa del límite de WhatsApp", () => {
    const largo = "a".repeat(3000);
    expect(agrupar([largo, largo]).length).toBe(2);
  });
});
