import { Insignia, Tarjeta, claseBoton, claseCampo } from "@/app/componentes";
import { ROLES, esRol, rolesGestionables } from "@/lib/roles";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { requerirRol } from "@/lib/supabase/server";
import { Notificaciones, type Aviso } from "@/components/Notificaciones";
import { cambiarActivo, cambiarRol, crearUsuario } from "./actions";

const MENSAJES: Record<string, Aviso> = {
  creado: { tono: "ok", texto: "Usuario creado. Entrégale su contraseña temporal por un medio seguro." },
  rol: { tono: "ok", texto: "Rol actualizado." },
  activado: { tono: "ok", texto: "Usuario activado." },
  desactivado: { tono: "ok", texto: "Usuario desactivado. Sus casos volvieron a «Por tomar»." },
  datos: { tono: "error", texto: "Revisa el correo y el nombre (mínimo 3 caracteres)." },
  rol_error: { tono: "error", texto: "No tienes permiso para asignar o modificar ese rol." },
  clave: { tono: "error", texto: "La contraseña temporal debe tener entre 12 y 72 caracteres." },
  existe: { tono: "error", texto: "Ya existe una cuenta con ese correo." },
  crear: { tono: "error", texto: "No se pudo crear el usuario. Intenta de nuevo." },
  guardar: { tono: "error", texto: "No se pudo guardar el cambio." },
  propio: { tono: "error", texto: "No puedes cambiar tu propio rol ni desactivar tu propia cuenta." },
  config: { tono: "error", texto: "Falta la clave secreta de Supabase en el servidor (SUPABASE_SECRET_KEY)." },
};

export default async function PaginaUsuarios({ searchParams }: PageProps<"/admin/usuarios">) {
  const { user, operador } = await requerirRol(["super_admin", "administrador"]);
  const sp = await searchParams;
  const clave = typeof sp.ok === "string" ? sp.ok : typeof sp.error === "string" ? (sp.error === "rol" ? "rol_error" : sp.error) : "";
  const mensaje = MENSAJES[clave];
  const permitidos = rolesGestionables(operador.rol);

  let db: ReturnType<typeof crearClienteAdmin> | null = null;
  try {
    db = crearClienteAdmin();
  } catch {
    db = null;
  }

  const [{ data: operadores }, cuentas, { data: asignadas }] = db
    ? await Promise.all([
        db.from("operadores").select("user_id, nombre, rol, activo, creado_en").order("nombre"),
        db.auth.admin.listUsers({ page: 1, perPage: 200 }),
        db.from("solicitudes").select("asignado_a").not("asignado_a", "is", null),
      ])
    : [{ data: [] }, null, { data: [] }];

  const correos = new Map((cuentas?.data?.users ?? []).map((u) => [u.id, { email: u.email, ultimo: u.last_sign_in_at }]));
  const enCola: Record<string, number> = {};
  for (const a of asignadas ?? []) enCola[a.asignado_a as string] = (enCola[a.asignado_a as string] ?? 0) + 1;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Usuarios del panel</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {operador.rol === "super_admin"
            ? "Como super administrador puedes gestionar todos los roles."
            : "Como administrador puedes crear y gestionar usuarios operativos."}
        </p>
      </div>

      <Notificaciones avisos={mensaje ? [mensaje] : []} />
      {!db ? (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {MENSAJES.config.texto}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Tarjeta titulo={`Usuarios (${(operadores ?? []).length})`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Nombre</th>
                    <th className="py-2 pr-4 font-medium">Rol</th>
                    <th className="py-2 pr-4 text-right font-medium">En su cola</th>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(operadores ?? []).map((o) => {
                    const rol = esRol(o.rol) ? o.rol : "operativo";
                    const propio = o.user_id === user.id;
                    const gestionable = !propio && permitidos.includes(rol);
                    const cuenta = correos.get(o.user_id);
                    return (
                      <tr key={o.user_id} className={o.activo ? "" : "opacity-60"}>
                        <td className="py-2.5 pr-4 align-top">
                          <div className="text-slate-900">
                            {o.nombre}
                            {propio ? <span className="text-xs text-slate-500"> (tú)</span> : null}
                          </div>
                          <div className="text-xs text-slate-500">{cuenta?.email ?? "—"}</div>
                        </td>
                        <td className="py-2.5 pr-4 align-top">
                          {gestionable ? (
                            <form action={cambiarRol.bind(null, o.user_id)} className="flex gap-1">
                              <select
                                name="rol"
                                defaultValue={rol}
                                aria-label={`Rol de ${o.nombre}`}
                                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                              >
                                {permitidos.map((r) => (
                                  <option key={r} value={r}>
                                    {ROLES[r]}
                                  </option>
                                ))}
                              </select>
                              <button type="submit" className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                                OK
                              </button>
                            </form>
                          ) : (
                            <Insignia tono={rol === "operativo" ? "neutro" : "info"}>{ROLES[rol]}</Insignia>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-right align-top tabular-nums">{enCola[o.user_id] ?? 0}</td>
                        <td className="py-2.5 pr-4 align-top">
                          <Insignia tono={o.activo ? "ok" : "neutro"}>{o.activo ? "Activo" : "Inactivo"}</Insignia>
                        </td>
                        <td className="py-2.5 text-right align-top">
                          {gestionable ? (
                            <form action={cambiarActivo.bind(null, o.user_id, !o.activo)}>
                              <button
                                type="submit"
                                className={`text-xs font-medium hover:underline ${o.activo ? "text-slate-600 hover:text-rose-700" : "text-teal-700"}`}
                              >
                                {o.activo ? "Desactivar" : "Activar"}
                              </button>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Tarjeta>
        </div>

        <Tarjeta titulo="Crear usuario">
          <form action={crearUsuario} className="space-y-3">
            <label className="block text-xs text-slate-500">
              Nombre
              <input name="nombre" required minLength={3} maxLength={80} autoComplete="off" className={`${claseCampo} mt-1`} />
            </label>
            <label className="block text-xs text-slate-500">
              Correo
              <input name="email" type="email" required autoComplete="off" className={`${claseCampo} mt-1`} />
            </label>
            <label className="block text-xs text-slate-500">
              Rol
              <select name="rol" defaultValue="operativo" className={`${claseCampo} mt-1`}>
                {permitidos.map((r) => (
                  <option key={r} value={r}>
                    {ROLES[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-500">
              Contraseña temporal (12 caracteres o más)
              <input
                name="clave"
                type="password"
                required
                minLength={12}
                maxLength={72}
                autoComplete="new-password"
                className={`${claseCampo} mt-1`}
              />
            </label>
            <button type="submit" disabled={!db} className={`${claseBoton} w-full disabled:opacity-60`}>
              Crear usuario
            </button>
            <p className="text-xs text-slate-500">
              Entrega la contraseña por un medio seguro (no por WhatsApp ni correo compartido).
            </p>
          </form>
        </Tarjeta>
      </div>
      <p className="text-xs text-slate-500">
        Desactivar una cuenta le quita el acceso de inmediato y devuelve sus casos a «Por tomar». Cada cambio queda
        en la auditoría.
      </p>
    </div>
  );
}
