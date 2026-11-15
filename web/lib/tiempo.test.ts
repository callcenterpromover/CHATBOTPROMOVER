import { describe, expect, it } from "vitest";
import { formatoTranscurrido } from "@/components/TiempoTranscurrido";

describe("tiempo transcurrido", () => {
  it("muestra segundos, minutos, horas y días", () => {
    expect(formatoTranscurrido(0)).toBe("0 s");
    expect(formatoTranscurrido(42.9)).toBe("42 s");
    expect(formatoTranscurrido(65)).toBe("1 min 05 s");
    expect(formatoTranscurrido(3 * 3600 + 120)).toBe("3 h 2 min");
    expect(formatoTranscurrido(2 * 86400 + 5 * 3600)).toBe("2 d 5 h");
    expect(formatoTranscurrido(-5)).toBe("0 s");
  });
});
