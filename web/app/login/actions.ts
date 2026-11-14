"use server";

import { redirect } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";

export async function iniciarSesion(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/login?error=1");

  const supabase = await crearCliente();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // Mensaje genérico: no se revela si el correo existe.
  if (error) redirect("/login?error=1");
  redirect("/");
}

export async function cerrarSesion() {
  const supabase = await crearCliente();
  await supabase.auth.signOut();
  redirect("/login");
}
