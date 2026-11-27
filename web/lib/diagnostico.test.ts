import { describe, expect, it } from "vitest";
import { agruparErrores, explicarError, ordenarRevisiones, revisarConfiguracion, type EstadoSistema, type FilaRegistro, type VariablesPresentes } from "./diagnostico";
import { finalDe, limpiarDetalle } from "./registro-errores";

const AHORA = new Date("2026-11-27T12:00:00Z").getTime();
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();

const fila = (p: Partial<FilaRegistro>): FilaRegistro => ({
  id: 1, origen: "webhook", codigo: "x", detalle: null, repeticiones: 1, primero_en: hace(5), ultimo_en: hace(5), revisado: false, ...p,
});

const VARS_OK: VariablesPresentes = {
  SUPABASE_SECRET_KEY: true, KAPSO_API_KEY: true, KAPSO_PHONE_NUMBER_ID: true, KAPSO_WEBHOOK_SECRET: true,
  META_APP_SECRET: false, META_PHONE_NUMBER_ID: false, META_WHATSAPP_TOKEN: false, WORKER_SECRET_VALIDO: true, MODO_SIMULACION: false,
};
const ESTADO_OK: EstadoSistema = {
  bot_activo: true, ultimo_mensaje_recibido: hace(10), mensajes_24h: 4, worker_ultimo_latido: hace(1), worker_equipo: "SEDE",
  ocr_pendientes: 0, ocr_con_error: 0, ocr_errores_por_codigo: {},
};

describe("explicarError", () => {
  it("explica los envíos según el código HTTP", () => {
    expect(explicarError("kapso_envio_401").gravedad).toBe("critica");
    expect(explicarError("kapso_envio_401").causa).toContain("KAPSO_API_KEY");
    expect(explicarError("meta_envio_404").causa).toContain("META_PHONE_NUMBER_ID");
    expect(explicarError("kapso_envio_400").causa).toContain("24 horas");
  });
  it("explica fallos del worker y códigos desconocidos", () => {
    expect(explicarError("ocr_TesseractNotFoundError").gravedad).toBe("critica");
    expect(explicarError("algo_raro").titulo).toContain("algo_raro");
  });
});

describe("agruparErrores", () => {
  it("suma repeticiones, ignora revisados y pone primero lo grave y reciente", () => {
    const g = agruparErrores(
      [
        fila({ id: 1, codigo: "limite_superado", repeticiones: 50, ultimo_en: hace(2) }),
        fila({ id: 2, codigo: "firma_invalida", repeticiones: 3, ultimo_en: hace(3) }),
        fila({ id: 3, codigo: "firma_invalida", repeticiones: 2, ultimo_en: hace(30) }),
        fila({ id: 4, codigo: "kapso_envio_401", revisado: true }),
      ],
      AHORA,
    );
    expect(g.map((x) => x.codigo)).toEqual(["firma_invalida", "limite_superado"]);
    expect(g[0].total).toBe(5);
  });
  it("un error crítico de hace días pesa menos que uno de hace minutos", () => {
    const g = agruparErrores(
      [fila({ id: 1, codigo: "firma_invalida", ultimo_en: hace(60 * 24 * 5) }), fila({ id: 2, codigo: "kapso_envio_429", ultimo_en: hace(1) })],
      AHORA,
    );
    expect(g[0].codigo).toBe("kapso_envio_429");
  });
});

describe("revisarConfiguracion", () => {
  it("todo correcto", () => {
    expect(revisarConfiguracion(VARS_OK, ESTADO_OK, AHORA).every((r) => r.ok)).toBe(true);
  });
  it("detecta variables de Kapso faltantes, bot pausado y que no llegan mensajes", () => {
    const r = ordenarRevisiones(
      revisarConfiguracion(
        { ...VARS_OK, KAPSO_WEBHOOK_SECRET: false },
        { ...ESTADO_OK, bot_activo: false, ultimo_mensaje_recibido: null },
        AHORA,
      ),
    );
    const malas = r.filter((x) => !x.ok).map((x) => x.id);
    expect(malas).toEqual(expect.arrayContaining(["canal", "bot", "mensajes"]));
    expect(r[0].ok).toBe(false);
    expect(r.find((x) => x.id === "canal")?.detalle).toContain("KAPSO_WEBHOOK_SECRET");
  });
  it("sin estado del sistema avisa de la migración", () => {
    expect(revisarConfiguracion(VARS_OK, null, AHORA).find((x) => x.id === "estado")?.ok).toBe(false);
  });
  it("worker sin señal de vida", () => {
    const r = revisarConfiguracion(VARS_OK, { ...ESTADO_OK, worker_ultimo_latido: hace(30), ocr_pendientes: 2 }, AHORA);
    expect(r.find((x) => x.id === "worker")).toMatchObject({ ok: false, gravedad: "alta" });
  });
});

describe("limpiarDetalle", () => {
  it("quita teléfonos y documentos", () => {
    expect(limpiarDetalle("paciente 573176550770 doc 1.144.000")).toBe("paciente [número] doc [número]");
    expect(limpiarDetalle("tel +57 317 655 0770")).toBe("tel [número]");
    expect(limpiarDetalle("ID …1234")).toBe("ID …1234");
    expect(limpiarDetalle("")).toBeNull();
    expect(finalDe("123456789")).toBe("…6789");
  });
});
