"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { esRol, inicioPorRol } from "@/lib/roles";
import { crearCliente } from "@/lib/supabase/server";
import { COOKIE_ACTIVIDAD, opcionesActividad } from "@/lib/supabase/sesion";

export async function iniciarSesion(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().slice(0, 254);
  const password = String(formData.get("password") ?? "").slice(0, 200);
  if (!email || !password) redirect("/login?error=1");

  const supabase = await crearCliente();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  // Mensaje genérico: no se revela si el correo existe.
  if (error || !data.user) redirect("/login?error=1");
  (await cookies()).set(COOKIE_ACTIVIDAD, String(Date.now()), opcionesActividad);

  // Redirección según el rol: administradores al dashboard, operativos a la lista de espera.
  const { data: op } = await supabase
    .from("operadores")
    .select("rol, activo")
    .eq("user_id", data.user.id)
    .maybeSingle();
  redirect(op?.activo && esRol(op.rol) ? inicioPorRol(op.rol) : "/");
}

export async function cerrarSesion() {
  const supabase = await crearCliente();
  await supabase.auth.signOut();
  (await cookies()).delete(COOKIE_ACTIVIDAD);
  redirect("/login?salida=1");
}
