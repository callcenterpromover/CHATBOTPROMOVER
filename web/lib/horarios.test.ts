import { describe, expect, it } from "vitest";
import { crucesAgendaSos, diasLegibles, franjasPara, opcionesPaciente, serviciosPara, validarFranjas } from "./horarios";
import { CATALOGO_PRUEBA as CAT, SERVICIOS_PRUEBA } from "./horarios.prueba";

const servicio = (codigo: string) => SERVICIOS_PRUEBA.find((s) => s.codigo === codigo)!;

describe("días y rangos", () => {
  it("agrupa días consecutivos", () => {
    expect(diasLegibles([1, 2, 3, 4, 5])).toBe("Lunes a viernes");
    expect(diasLegibles([1, 3, 5])).toBe("Lunes, miércoles y viernes");
    expect(diasLegibles([1, 2, 3, 5])).toBe("Lunes a miércoles y viernes");
    expect(diasLegibles([4])).toBe("Jueves");
  });

  it("muestra el rango de inicio hasta la última cita (fin − duración)", () => {
    const fono = franjasPara(CAT, servicio("VAL_FONO"), 8);
    expect(opcionesPaciente(fono, 15)).toEqual(["Lunes a viernes, de 7:00 a 8:30 a. m."]);
    const fisio = franjasPara(CAT, servicio("VAL_FISIO_ST"), 40);
    expect(opcionesPaciente(fisio, 15)).toEqual([
      "Lunes a viernes, de 7:00 a. m. a 12:00 p. m.",
      "Lunes a viernes, de 1:15 a 4:45 p. m.",
    ]);
    expect(opcionesPaciente(franjasPara(CAT, servicio("T_RESPIRATORIA"), 40), 20)).toEqual(["Lunes a viernes, de 11:00 a 11:40 a. m."]);
    expect(opcionesPaciente(franjasPara(CAT, servicio("VAL_RESPIRATORIA"), 40), 30)).toEqual(["Lunes a viernes, de 11:00 a 11:40 a. m."]);
  });

  it("una sola hora posible se muestra como hora exacta", () => {
    expect(opcionesPaciente([{ dia_semana: 2, hora_inicio: "13:00", hora_fin: "13:15" }], 15)).toEqual(["Martes, a la 1:00 p. m."]);
  });

  it("valoración SOS: sin martes", () => {
    const ops = opcionesPaciente(franjasPara(CAT, servicio("VAL_FISIO_SOS"), 40), 15);
    expect(ops).toEqual(["Lunes y miércoles a viernes, de 7:00 a 11:15 a. m.", "Lunes y viernes, de 1:15 a 4:00 p. m."]);
    expect(ops.join(" ")).not.toMatch(/martes/i);
  });
});

describe("catálogo por EPS y edad", () => {
  it("Salud Total no ve servicios ni especialistas de SOS", () => {
    const { principales, especialistas } = serviciosPara(CAT, "SALUD_TOTAL");
    expect(principales.map((s) => s.codigo)).toEqual(["VAL_FISIO_ST", "TF_ST", "VAL_FONO", "VAL_RESPIRATORIA", "T_RESPIRATORIA", "VAL_SIN_HORARIO"]);
    expect(especialistas).toEqual([]);
  });

  it("SOS ve sus servicios y los especialistas aparte", () => {
    const { principales, especialistas } = serviciosPara(CAT, "SOS");
    expect(principales[0].codigo).toBe("VAL_FISIO_SOS");
    expect(especialistas.map((s) => s.codigo)).toEqual(["FISIATRIA", "ORTOPEDIA"]);
  });

  it("otra EPS solo ve los servicios para todas", () => {
    expect(serviciosPara(CAT, "OTRA").principales.every((s) => s.eps === "TODAS")).toBe(true);
  });

  it("los servicios por grupo de edad usan la franja de niños o adultos", () => {
    expect(franjasPara(CAT, servicio("VAL_FONO"), 10).every((f) => f.grupo_edad === "NINOS")).toBe(true);
    expect(franjasPara(CAT, servicio("VAL_FONO"), 30).every((f) => f.grupo_edad === "ADULTOS")).toBe(true);
    expect(franjasPara({ ...CAT, edadCorteNinos: 8 }, servicio("VAL_FONO"), 10)[0].grupo_edad).toBe("ADULTOS");
  });
});

describe("validación", () => {
  it("acepta franjas correctas", () => {
    expect(validarFranjas([{ dia: 1, inicio: "07:00", fin: "12:15" }, { dia: 1, inicio: "13:15", fin: "17:00" }], 45)).toBeNull();
  });

  it("rechaza errores comunes", () => {
    expect(validarFranjas([{ dia: 1, inicio: "09:00", fin: "08:00" }], 15)).toMatch(/posterior/);
    expect(validarFranjas([{ dia: 1, inicio: "07:03", fin: "08:00" }], 15)).toMatch(/múltiplos de 5/);
    expect(validarFranjas([{ dia: 1, inicio: "07:00", fin: "07:30" }], 45)).toMatch(/no alcanza/);
    expect(validarFranjas([{ dia: 2, inicio: "07:00", fin: "09:00" }, { dia: 2, inicio: "08:30", fin: "10:00" }], 15)).toMatch(/se cruzan/);
    expect(validarFranjas([{ dia: 9, inicio: "07:00", fin: "09:00" }], 15)).toMatch(/inválidos/);
  });

  it("detecta cruces entre fisioterapia SOS y especialistas", () => {
    expect(crucesAgendaSos(CAT)).toEqual([]);
    const conCruce = { ...CAT, franjas: [...CAT.franjas, { servicio_id: 3, grupo_edad: "TODOS" as const, dia_semana: 2, hora_inicio: "08:00", hora_fin: "09:00" }] };
    expect(crucesAgendaSos(conCruce)).toEqual([
      { dia: 2, fisio: "Valoración de fisioterapia (OPS de terapia física integral)", especialista: "Fisiatría", rango: "08:00–09:00" },
      { dia: 2, fisio: "Valoración de fisioterapia (OPS de terapia física integral)", especialista: "Ortopedia (UPI osteomuscular)", rango: "08:00–09:00" },
    ]);
  });
});
