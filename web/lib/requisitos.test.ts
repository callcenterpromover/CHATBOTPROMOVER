import { describe, expect, it } from "vitest";
import { CATALOGO_PRUEBA } from "./horarios.prueba";
import { documentosEditables, requisitos, type DatosRequisitos } from "./requisitos";

const HOY = "2026-11-24T10:00:00.000Z";
const servicio = (codigo: string) => CATALOGO_PRUEBA.servicios.find((s) => s.codigo === codigo)!;
const base: DatosRequisitos = {
  eps: "SOS",
  edad: 40,
  orden_estado: "NO_RECIBIDA",
  historia_estado: "NO_RECIBIDA",
  plan_estado: "NO_REQUERIDO",
  autorizacion_estado: "NO_DETERMINADA",
  ultima_asistencia: null,
};
const resumen = (r: ReturnType<typeof requisitos>) => r.map((x) => `${x.clave}:${x.estado}`);

describe("requisitos por tipo de solicitud", () => {
  it("terapia: solo última asistencia y plan", () => {
    expect(resumen(requisitos({ ...base, eps: "SALUD_TOTAL", ultima_asistencia: "2026-11-20" }, servicio("TF_ST"), HOY))).toEqual([
      "ULTIMA_ASISTENCIA:RECIBIDO",
      "PLAN:FALTA",
    ]);
  });

  it("terapia con más de 20 días: verificar", () => {
    const r = requisitos({ ...base, ultima_asistencia: "2026-10-01", plan_estado: "RECIBIDO" }, servicio("TF_ST"), HOY);
    expect(resumen(r)).toEqual(["ULTIMA_ASISTENCIA:VERIFICAR", "PLAN:RECIBIDO"]);
    expect(r[0].detalle).toContain("medicina general");
  });

  it("valoración de fisioterapia SOS: orden e historia, sin OPS", () => {
    expect(resumen(requisitos({ ...base, orden_estado: "LEGIBLE" }, servicio("VAL_FISIO_SOS"), HOY))).toEqual(["ORDEN:RECIBIDO", "HISTORIA:FALTA"]);
  });

  it("fonoaudiología SOS: orden y OPS obligatoria, sin historia", () => {
    expect(resumen(requisitos(base, servicio("VAL_FONO"), HOY))).toEqual(["ORDEN:FALTA", "OPS:FALTA"]);
  });

  it("especialista SOS adulto: OPS a verificar; menor: obligatoria", () => {
    expect(resumen(requisitos(base, servicio("FISIATRIA"), HOY))).toEqual(["ORDEN:FALTA", "HISTORIA:FALTA", "OPS:VERIFICAR"]);
    expect(resumen(requisitos({ ...base, edad: 17 }, servicio("FISIATRIA"), HOY))).toContain("OPS:FALTA");
  });

  it("Salud Total no pide OPS", () => {
    expect(resumen(requisitos({ ...base, eps: "SALUD_TOTAL" }, servicio("VAL_FONO"), HOY))).toEqual(["ORDEN:FALTA"]);
  });

  it("solo se editan los documentos que aplican", () => {
    expect(documentosEditables(servicio("TF_ST"), "SALUD_TOTAL")).toMatchObject({ orden: false, plan: true, ultimaAsistencia: true });
    expect(documentosEditables(servicio("VAL_FONO"), "SOS")).toMatchObject({ orden: true, historia: false, plan: false });
  });
});
