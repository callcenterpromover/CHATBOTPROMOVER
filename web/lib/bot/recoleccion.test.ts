import { describe, expect, it } from "vitest";
import { estadoRecoleccion, extraerDocumento, extraerNombre } from "./recoleccion";

describe("datos escritos por el paciente", () => {
  it.each([
    ["1000000020", "1000000020"],
    ["CC 1.000.000.020", "1000000020"],
    ["mi cédula es 31 939 446", "31939446"],
    ["tengo 45 años", null],
    ["Mi número es 3001234567", null],
    ["celular 3001234567, cédula 1000000020", "1000000020"],
    ["orden 4567890", null],
    ["Laura Prueba\n1.000.000.020", "1000000020"],
  ])("documento en «%s»", (texto, esperado) => expect(extraerDocumento(texto)).toBe(esperado));

  it.each([
    ["Laura Prueba Veinte", "Laura Prueba Veinte"],
    ["Hola, mi nombre es juan pérez", "Juan Pérez"],
    ["1000000020 María Gómez", "María Gómez"],
    ["hola buenas tardes", null],
    ["quiero una cita", null],
    ["Buenas tardes necesito una cita de fisioterapia para mi mamá", null],
    ["Quiero agendar terapia física", null],
    ["Hola, ¿cuánto se demora?", null],
    ["Te envío los documentos", null],
    ["Muchas gracias", null],
    ["Buenas tardes, María de los Ángeles Pérez", "María de los Ángeles Pérez"],
    ["me llamo Juan Pérez y necesito una cita", "Juan Pérez"],
    ["soy la mamá del paciente", null],
    ["Nombre: ANA LUCÍA GÓMEZ\nCC 1000000020", "Ana Lucía Gómez"],
    ["CC 1000000020 Pedro Ramírez", "Pedro Ramírez"],
    ["Hola\nCarlos Andrés Ruiz Mora\nadjunto la orden", "Carlos Andrés Ruiz Mora"],
  ])("nombre en «%s»", (texto, esperado) => expect(extraerNombre(texto)).toBe(esperado));
});

describe("¿llegó todo?", () => {
  const ok = { documento: "1", nombre: "Ana Prueba" };
  it("orden e historia, o plan", () => {
    expect(estadoRecoleccion(ok, [{ tipo_documento: "ORDEN", estado: "COMPLETADO" }, { tipo_documento: "HISTORIA", estado: "COMPLETADO" }]).tipo).toBe("COMPLETA");
    expect(estadoRecoleccion(ok, [{ tipo_documento: "PLAN", estado: "COMPLETADO" }]).tipo).toBe("COMPLETA");
  });
  it("la cédula y el nombre leídos de la orden cuentan como recibidos", () => {
    const docs = [{ tipo_documento: "PLAN", estado: "COMPLETADO" }];
    const campos = [{ campo: "DOCUMENTO", confianza: "ALTA", valor_ocr: "1000000020" }, { campo: "NOMBRE", confianza: "MEDIA", valor_ocr: "ANA PRUEBA" }];
    expect(estadoRecoleccion({}, docs, campos).tipo).toBe("COMPLETA");
  });
  it("un dato leído con confianza baja no cuenta", () => {
    const e = estadoRecoleccion({ documento: "1" }, [{ tipo_documento: "PLAN", estado: "COMPLETADO" }], [{ campo: "NOMBRE", confianza: "BAJA", valor_ocr: "A?A" }]);
    expect(e).toMatchObject({ tipo: "FALTAN", faltan: ["el nombre completo"] });
  });
  it("mientras se leen documentos no dice qué falta", () => {
    expect(estadoRecoleccion(ok, [{ tipo_documento: "DESCONOCIDO", estado: "PENDIENTE" }]).tipo).toBe("LEYENDO");
  });
  it("sin documentos pide orden e historia (o plan)", () => {
    const e = estadoRecoleccion({}, []);
    expect(e).toMatchObject({ tipo: "FALTAN" });
    if (e.tipo === "FALTAN") expect(e.faltan).toEqual(["el número de cédula", "el nombre completo", "la orden médica", "la historia clínica (o, si ya estás en terapias, solo el plan de tratamiento)"]);
  });
});
