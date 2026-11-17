"use server";

import { cookies, headers } from "next/headers";
import { claveLimite, dentroDelLimite, ipCliente, reiniciarLimite } from "@/lib/limites";
import { redirect } from "next/navigation";
import { esRol, inicioPorRol } from "@/lib/roles";
import { crearCliente } from "@/lib/supabase/server";
import { COOKIE_ACTIVIDAD, opcionesActividad } from "@/lib/supabase/sesion";

export async function iniciarSesion(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().slice(0, 254);
  const password = String(formData.get("password") ?? "").slice(0, 200);
  if (!email || !password) redirect("/login?error=1");

  // Fuerza bruta: máximo 5 intentos por cuenta y 20 por IP cada 15 minutos.
  const claveCorreo = claveLimite("login-correo", email);
  const [porCorreo, porIp] = await Promise.all([
    dentroDelLimite(claveCorreo, 5, 900),
    dentroDelLimite(claveLimite("login-ip", ipCliente(await headers())), 20, 900),
  ]);
  if (!porCorreo || !porIp) redirect("/login?error=bloqueado");

  const supabase = await crearCliente();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  // Mensaje genérico: no se revela si el correo existe.
  if (error || !data.user) redirect("/login?error=1");
  await reiniciarLimite(claveCorreo);
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
