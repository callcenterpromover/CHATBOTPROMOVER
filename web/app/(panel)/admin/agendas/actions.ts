"use server";

// Acciones del panel Agendas. Cada una vuelve a exigir rol de administrador y llama a funciones de
// la base que también lo exigen, validan y auditan. Se usa la sesión del usuario (no la clave secreta).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validarFranjas, type FranjaEditable } from "@/lib/horarios";
import { requerirRol } from "@/lib/supabase/server";

const ERRORES: Record<string, string> = {
  no_autorizado: "permiso",
  franjas_cruzadas: "cruzadas",
  franja_muy_corta: "corta",
  cruce_agenda_sos: "cruce_sos",
  grupo_edad_invalido: "grupo",
  no_encontrado: "no_encontrado",
};

function volver(destino: string, parametro: string): never {
  revalidatePath("/admin/agendas");
  redirect(`/admin/agendas?${destino ? `${destino}&` : ""}${parametro}`);
}

function codigoError(mensaje: string | undefined): string {
  if (!mensaje) return "guardar";
  for (const [clave, codigo] of Object.entries(ERRORES)) if (mensaje.includes(clave)) return codigo;
  if (/duplicate key|unique/i.test(mensaje)) return "duplicado";
  if (/check constraint|violates|invalid input/i.test(mensaje)) return "datos";
  return "guardar";
}

async function sesion() {
  return requerirRol(["super_admin", "administrador"]);
}

const texto = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const entero = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : Number.parseInt(v, 10);
};
const id = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 32768 ? n : null;
};

export async function guardarServicio(servicioId: number | null, formData: FormData) {
  const { supabase } = await sesion();
  const datos = {
    codigo: texto(formData, "codigo", 40).toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
    nombre: texto(formData, "nombre", 80),
    nombre_visoft: texto(formData, "nombre_visoft", 160),
    duracion_min: entero(formData, "duracion_min"),
    eps: texto(formData, "eps", 20),
    menu: texto(formData, "menu", 20),
    por_grupo_edad: formData.get("por_grupo_edad") === "on",
    edad_minima: entero(formData, "edad_minima"),
    agenda: texto(formData, "agenda", 30),
    autorizacion_salud_total: texto(formData, "autorizacion_salud_total", 20),
    autorizacion_sos: texto(formData, "autorizacion_sos", 20),
    ubicacion: texto(formData, "ubicacion", 160),
    profesional: texto(formData, "profesional", 120),
    notas_equipo: String(formData.get("notas_equipo") ?? "").trim().slice(0, 600),
    orden: entero(formData, "orden") ?? 0,
    activo: formData.get("activo") === "on",
  };
  const destino = servicioId ? `s=${servicioId}` : "s=nuevo";
  if (datos.nombre.length < 3 || !datos.duracion_min || datos.duracion_min < 5 || datos.duracion_min > 240) volver(destino, "error=datos");
  const { data, error } = await supabase.rpc("guardar_servicio", { p_id: servicioId, p_datos: datos });
  if (error) volver(destino, `error=${codigoError(error.message)}`);
  volver(`s=${data}`, servicioId ? "ok=servicio" : "ok=creado");
}

export async function guardarFranjas(servicioId: number, grupo: string, duracion: number, formData: FormData) {
  const { supabase } = await sesion();
  const destino = `s=${servicioId}${grupo !== "TODOS" ? `&g=${grupo}` : ""}`;
  let franjas: FranjaEditable[];
  try {
    const crudo = JSON.parse(String(formData.get("franjas") ?? "[]")) as unknown;
    if (!Array.isArray(crudo) || crudo.length > 60) throw new Error();
    franjas = crudo.map((f) => ({ dia: Number(f.dia), inicio: String(f.inicio).slice(0, 5), fin: String(f.fin).slice(0, 5) }));
  } catch {
    volver(destino, "error=datos");
  }
  if (validarFranjas(franjas, duracion)) volver(destino, "error=datos");
  const { error } = await supabase.rpc("guardar_franjas", { p_servicio: servicioId, p_grupo_edad: grupo, p_franjas: franjas });
  if (error) volver(destino, `error=${codigoError(error.message)}`);
  volver(destino, "ok=franjas");
}

export async function guardarConfig(formData: FormData) {
  const { supabase } = await sesion();
  const edad = entero(formData, "edad_corte_ninos");
  if (!edad || edad < 1 || edad > 30) volver("v=reglas", "error=datos");
  const { error } = await supabase.rpc("guardar_config_agenda", { p_edad_corte: edad });
  if (error) volver("v=reglas", `error=${codigoError(error.message)}`);
  volver("v=reglas", "ok=config");
}

export async function guardarIps(ipsId: number | null, formData: FormData) {
  const { supabase } = await sesion();
  const datos = {
    nombre: texto(formData, "nombre", 80),
    es_primaria: formData.get("es_primaria") === "on",
    requiere_ops: formData.get("requiere_ops") === "on",
    nota: texto(formData, "nota", 300),
    orden: entero(formData, "orden") ?? 0,
    activo: formData.get("activo") === "on" || ipsId === null,
  };
  if (datos.nombre.length < 2) volver("v=reglas", "error=datos");
  const { error } = await supabase.rpc("guardar_ips_sos", { p_id: ipsId, p_datos: datos });
  if (error) volver("v=reglas", `error=${codigoError(error.message)}`);
  volver("v=reglas", "ok=guardado");
}

export async function guardarLineamiento(lineamientoId: number | null, formData: FormData) {
  const { supabase } = await sesion();
  const datos = {
    titulo: texto(formData, "titulo", 80),
    texto: String(formData.get("texto") ?? "").trim().slice(0, 600),
    aplica_eps: texto(formData, "aplica_eps", 20) || "TODAS",
    solo_menores: formData.get("solo_menores") === "on",
    orden: entero(formData, "orden") ?? 0,
    activo: formData.get("activo") === "on" || lineamientoId === null,
  };
  if (datos.titulo.length < 3 || datos.texto.length < 3) volver("v=reglas", "error=datos");
  const { error } = await supabase.rpc("guardar_lineamiento", { p_id: lineamientoId, p_datos: datos });
  if (error) volver("v=reglas", `error=${codigoError(error.message)}`);
  volver("v=reglas", "ok=guardado");
}

export async function eliminarRegistro(tabla: "ips_sos" | "lineamientos_generales", registroId: number) {
  const { supabase } = await sesion();
  if (!id(registroId) || !["ips_sos", "lineamientos_generales"].includes(tabla)) volver("v=reglas", "error=datos");
  const { error } = await supabase.rpc("eliminar_registro_agenda", { p_tabla: tabla, p_id: registroId });
  if (error) volver("v=reglas", `error=${codigoError(error.message)}`);
  volver("v=reglas", "ok=eliminado");
}
