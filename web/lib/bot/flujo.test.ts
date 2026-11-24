import { describe, expect, it } from "vitest";
import { claseServicio, diasDesde, interpretarUltimaAsistencia, requiereHistoria, requiereOps } from "./flujo";

const AHORA = "2026-11-15T10:00:00.000Z";

describe("fecha de última asistencia", () => {
  it.each([
    ["hoy", "2026-11-15"],
    ["ayer", "2026-11-14"],
    ["hace 5 días", "2026-11-10"],
    ["hace 2 semanas", "2026-11-01"],
    ["hace un mes", "2026-10-16"],
    ["10/11", "2026-11-10"],
    ["10/11/2026", "2026-11-10"],
    ["10-11-26", "2026-11-10"],
    ["10 de noviembre", "2026-11-10"],
    ["el 3 de octubre de 2026", "2026-10-03"],
    ["20/12", "2025-12-20"], // sin año y en el futuro: el año anterior
  ])("«%s» → %s", (texto, esperado) => {
    expect(interpretarUltimaAsistencia(texto, AHORA)).toBe(esperado);
  });

  it.each(["la otra semana", "31/02", "20/12/2026", "mañana"])("no adivina: «%s»", (texto) => {
    expect(interpretarUltimaAsistencia(texto, AHORA)).toBeNull();
  });

  it("cuenta los días", () => {
    expect(diasDesde("2026-10-25", AHORA)).toBe(21);
  });
});

describe("tipo de servicio y requisitos", () => {
  const s = (codigo: string, nombre: string, menu: "PRINCIPAL" | "ESPECIALISTAS" = "PRINCIPAL") => ({ codigo, nombre, menu });
  it("clasifica valoración, terapia y especialista", () => {
    expect(claseServicio(s("VAL_FISIO_ST", "Valoración de fisioterapia"))).toBe("VALORACION");
    expect(claseServicio(s("TF_SOS", "Terapia física (continuidad)"))).toBe("TERAPIA");
    expect(claseServicio(s("T_FONO", "Terapia de fonoaudiología (continuidad)"))).toBe("TERAPIA");
    expect(claseServicio(s("FISIATRIA", "Fisiatría", "ESPECIALISTAS"))).toBe("ESPECIALISTA");
  });
  it("historia: especialistas y valoración de fisioterapia", () => {
    expect(requiereHistoria(s("VAL_FISIO_SOS", "Valoración de fisioterapia (OPS…)"))).toBe(true);
    expect(requiereHistoria(s("ORTOPEDIA", "Ortopedia", "ESPECIALISTAS"))).toBe(true);
    expect(requiereHistoria(s("VAL_FONO", "Valoración de fonoaudiología"))).toBe(false);
    expect(requiereHistoria(s("TF_ST", "Terapia física"))).toBe(false);
  });
  it("OPS solo en SOS: SIEMPRE, y CONDICIONAL/MENORES solo para menores de 18", () => {
    expect(requiereOps({ autorizacion_sos: "SIEMPRE" }, "SOS", 40)).toBe(true);
    expect(requiereOps({ autorizacion_sos: "SIEMPRE" }, "SALUD_TOTAL", 40)).toBe(false);
    expect(requiereOps({ autorizacion_sos: "CONDICIONAL" }, "SOS", 17)).toBe(true);
    expect(requiereOps({ autorizacion_sos: "CONDICIONAL" }, "SOS", 40)).toBe(false);
    expect(requiereOps({ autorizacion_sos: "NO" }, "SOS", 5)).toBe(false);
  });
});
