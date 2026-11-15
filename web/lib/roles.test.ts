import { describe, expect, it } from "vitest";
import { esAdmin, esRol, inicioPorRol, rolesGestionables } from "./roles";

describe("roles", () => {
  it("redirige según el rol", () => {
    expect(inicioPorRol("super_admin")).toBe("/dashboard");
    expect(inicioPorRol("administrador")).toBe("/dashboard");
    expect(inicioPorRol("operativo")).toBe("/lista-espera");
    expect(inicioPorRol(null)).toBe("/login");
  });

  it("solo super_admin y administrador son administradores", () => {
    expect(esAdmin("super_admin")).toBe(true);
    expect(esAdmin("administrador")).toBe(true);
    expect(esAdmin("operativo")).toBe(false);
    expect(esAdmin(undefined)).toBe(false);
  });

  it("un administrador solo gestiona operativos; un operativo no gestiona a nadie", () => {
    expect(rolesGestionables("super_admin")).toEqual(["super_admin", "administrador", "operativo"]);
    expect(rolesGestionables("administrador")).toEqual(["operativo"]);
    expect(rolesGestionables("operativo")).toEqual([]);
  });

  it("valida valores de rol", () => {
    expect(esRol("operativo")).toBe(true);
    expect(esRol("root")).toBe(false);
    expect(esRol(undefined)).toBe(false);
  });
});
