import { requerirRol } from "@/lib/supabase/server";

// Todo lo que está bajo /admin es solo para super_admin y administrador.
export default async function LayoutAdmin({ children }: LayoutProps<"/admin">) {
  await requerirRol(["super_admin", "administrador"]);
  return children;
}
