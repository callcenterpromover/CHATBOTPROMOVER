"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { esRol, rolesGestionables, type Rol } from "@/lib/roles";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { requerirRol } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

function volver(parametro: string): never {
  revalidatePath("/admin/usuarios");
  redirect(`/admin/usuarios?${parametro}`);
}

// La gestión de cuentas usa la clave secreta (solo en el servidor), así que cada acción vuelve a
// comprobar el rol de quien la ejecuta y qué roles puede tocar.
async function contexto() {
  const sesion = await requerirRol(["super_admin", "administrador"]);
  let db;
  try {
    db = crearClienteAdmin();
  } catch {
    volver("error=config");
  }
  return { ...sesion, db };
}

async function rolDe(db: ReturnType<typeof crearClienteAdmin>, userId: string): Promise<Rol | null> {
  const { data } = await db.from("operadores").select("rol").eq("user_id", userId).maybeSingle();
  return esRol(data?.rol) ? data.rol : null;
}

async function auditar(db: ReturnType<typeof crearClienteAdmin>, operador: string, detalle: string) {
  await db.from("auditoria").insert({ operador, accion: "GESTION_USUARIO", detalle: detalle.slice(0, 60) });
}

export async function crearUsuario(formData: FormData) {
  const { db, user, operador } = await contexto();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nombre = String(formData.get("nombre") ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  const rol = String(formData.get("rol") ?? "");
  const clave = String(formData.get("clave") ?? "");

  if (!EMAIL.test(email) || nombre.length < 3) volver("error=datos");
  if (!esRol(rol) || !rolesGestionables(operador.rol).includes(rol)) volver("error=rol");
  if (clave.length < 12 || clave.length > 72) volver("error=clave");

  const { data, error } = await db.auth.admin.createUser({ email, password: clave, email_confirm: true });
  if (error || !data.user) volver(error?.status === 422 ? "error=existe" : "error=crear");

  const { error: errorOp } = await db.from("operadores").insert({ user_id: data.user.id, nombre, rol, activo: true });
  if (errorOp) {
    await db.auth.admin.deleteUser(data.user.id); // no dejar una cuenta sin perfil
    volver("error=crear");
  }
  await auditar(db, user.id, `crear ${rol}`);
  volver("ok=creado");
}

export async function cambiarRol(userId: string, formData: FormData) {
  const { db, user, operador } = await contexto();
  const nuevo = String(formData.get("rol") ?? "");
  if (!UUID.test(userId) || userId === user.id) volver("error=propio");
  const actual = await rolDe(db, userId);
  const permitidos = rolesGestionables(operador.rol);
  if (!actual || !permitidos.includes(actual) || !esRol(nuevo) || !permitidos.includes(nuevo)) volver("error=rol");

  const { error } = await db.from("operadores").update({ rol: nuevo }).eq("user_id", userId);
  if (error) volver("error=guardar");
  await auditar(db, user.id, `rol ${actual} a ${nuevo}`);
  volver("ok=rol");
}

export async function cambiarActivo(userId: string, activo: boolean) {
  const { db, user, operador } = await contexto();
  if (!UUID.test(userId) || userId === user.id) volver("error=propio");
  const actual = await rolDe(db, userId);
  if (!actual || !rolesGestionables(operador.rol).includes(actual)) volver("error=rol");

  const { error } = await db.from("operadores").update({ activo }).eq("user_id", userId);
  if (error) volver("error=guardar");
  if (!activo) {
    // Sus casos vuelven a la bolsa general para que nadie quede esperando a una cuenta inactiva.
    await db.from("solicitudes").update({ asignado_a: null, fecha_asignacion: null }).eq("asignado_a", userId);
  }
  await auditar(db, user.id, activo ? "activar" : "desactivar");
  volver(activo ? "ok=activado" : "ok=desactivado");
}
