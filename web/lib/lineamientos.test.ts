import { describe, expect, it } from "vitest";
import { SERVICIOS_PRUEBA } from "./horarios.prueba";
import { requisitoAutorizacion, verificaciones, type IpsSos, type Lineamiento } from "./lineamientos";

const servicio = (codigo: string) => SERVICIOS_PRUEBA.find((s) => s.codigo === codigo)!;
const IPS: IpsSos[] = [
  { id: 1, nombre: "Morichal", es_primaria: true, requiere_ops: false, nota: null, orden: 1, activo: true },
  { id: 2, nombre: "Puerto Tejada", es_primaria: false, requiere_ops: true, nota: "Solo especialistas y con OPS.", orden: 2, activo: true },
];
const LIN: Lineamiento[] = [
  { id: 1, titulo: "Protección Laboral", texto: "No agendar.", aplica_eps: "TODAS", solo_menores: false, orden: 1, activo: true },
  { id: 2, titulo: "Vencimiento de la OPS", texto: "Verificar.", aplica_eps: "SOS", solo_menores: false, orden: 2, activo: true },
  { id: 3, titulo: "Datos del acudiente", texto: "Pedir.", aplica_eps: "TODAS", solo_menores: true, orden: 3, activo: true },
  { id: 4, titulo: "Inactivo", texto: "No sale.", aplica_eps: "TODAS", solo_menores: false, orden: 4, activo: false },
];

describe("requisito de autorización", () => {
  it("depende de la EPS y de la regla del servicio", () => {
    expect(requisitoAutorizacion(servicio("VAL_FONO"), "SALUD_TOTAL", 30)).toBe("SI");
    expect(requisitoAutorizacion(servicio("VAL_FONO"), "SOS", 30)).toBe("SI");
    expect(requisitoAutorizacion(servicio("T_RESPIRATORIA"), "SOS", 30)).toBe("NO");
    expect(requisitoAutorizacion({ autorizacion_salud_total: "NO", autorizacion_sos: "MENORES" }, "SOS", 10)).toBe("SI");
    expect(requisitoAutorizacion({ autorizacion_salud_total: "NO", autorizacion_sos: "MENORES" }, "SOS", 30)).toBe("NO");
    expect(requisitoAutorizacion(servicio("VAL_FONO"), "OTRA", 30)).toBe("NO");
  });
});

describe("verificaciones", () => {
  const titulos = (v: ReturnType<typeof verificaciones>) => v.map((x) => x.titulo);

  it("SOS sin OPS: alerta, IPS y lineamientos de SOS", () => {
    const v = verificaciones({ servicio: { ...servicio("FISIATRIA"), autorizacion_sos: "SIEMPRE" }, eps: "SOS", edad: 40, autorizacionEstado: "NO_DETERMINADA", lineamientos: LIN, ips: IPS });
    expect(v[0]).toMatchObject({ titulo: "Falta OPS", nivel: "alerta" });
    expect(titulos(v)).toEqual(["Falta OPS", "Datos de agendamiento", "Verificar la IPS del paciente", "Protección Laboral", "Vencimiento de la OPS"]);
    expect(v[1].texto).toContain("Consulta de primera vez con Medicina Física y Rehabilitación");
  });

  it("menor de 16 con especialista: alerta de redirección y datos del acudiente", () => {
    const v = verificaciones({ servicio: { ...servicio("ORTOPEDIA"), autorizacion_sos: "SIEMPRE" }, eps: "SOS", edad: 15, autorizacionEstado: "RECIBIDA", lineamientos: LIN, ips: IPS });
    expect(titulos(v)).toContain("Menor de 16 años");
    expect(titulos(v)).toContain("Datos del acudiente");
    expect(v[0]).toMatchObject({ titulo: "OPS recibida", nivel: "info" });
  });

  it("Salud Total no muestra IPS ni lineamientos de SOS", () => {
    const v = verificaciones({ servicio: servicio("VAL_FONO"), eps: "SALUD_TOTAL", edad: 7, autorizacionEstado: null, lineamientos: LIN, ips: IPS });
    expect(titulos(v)).toEqual(["Falta autorización", "Datos de agendamiento", "Protección Laboral", "Datos del acudiente"]);
    expect(v[1].texto).toContain("niños");
  });
});
