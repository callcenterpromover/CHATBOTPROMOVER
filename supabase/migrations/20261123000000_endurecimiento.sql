-- Endurecimiento tras la auditoría de seguridad (2026-11-17).
-- 1) Cerrar una solicitud solo por cerrar_solicitud (valida motivo, verifica permiso y audita).
--    Antes, un operativo podía borrar por la API REST su solicitud asignada sin pasar por la auditoría.
-- 2) Límite de intentos (inicio de sesión y mensajes por número de WhatsApp) en la base, porque
--    Vercel no comparte memoria entre instancias.

create or replace function public.cerrar_solicitud(p_id uuid, p_motivo text default 'GESTIONADA')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_borradas integer;
  v_restos integer;
begin
  if p_motivo not in ('GESTIONADA', 'CERRADA_DUPLICADA', 'CERRADA_POR_USUARIO') then
    raise exception 'motivo_invalido';
  end if;
  -- Corre con permisos del dueño: el permiso se verifica aquí (asignado a quien llama o administrador).
  if not coalesce((select private.puede_editar(p_id)), false) then
    raise exception 'solicitud_no_encontrada';
  end if;

  perform set_config('app.motivo_cierre', p_motivo, true);

  delete from public.solicitudes where id = p_id;
  get diagnostics v_borradas = row_count;
  if v_borradas = 0 then
    raise exception 'solicitud_no_encontrada';
  end if;

  v_restos := private.contar_restos(p_id);
  if v_restos > 0 then
    raise exception 'eliminacion_incompleta';
  end if;

  perform private.auditar('CERRAR_SOLICITUD', p_motivo);
  return jsonb_build_object('eliminada', true, 'motivo', p_motivo);
end;
$$;
revoke all on function public.cerrar_solicitud(uuid, text) from public, anon;
grant execute on function public.cerrar_solicitud(uuid, text) to authenticated;

-- Sin borrado directo desde el panel: solo por la función (las observaciones se van en cascada).
revoke delete on public.solicitudes from authenticated;
revoke delete on public.observaciones from authenticated;
drop policy if exists solicitudes_borrar on public.solicitudes;
drop policy if exists observaciones_borrar on public.observaciones;

-- ------------------------------------------------------------------ límite de intentos
-- Las claves llegan ya resumidas con HMAC desde el servidor (nunca IP, correo ni teléfono en claro).
create table private.limites (
  id bigint generated always as identity primary key,
  clave text not null check (char_length(clave) between 8 and 120),
  creado_en timestamptz not null default now()
);
create index limites_clave_idx on private.limites (clave, creado_en);
alter table private.limites enable row level security;
revoke all on private.limites from public, anon, authenticated;

-- Registra un uso y dice si aún está dentro del límite (p_max usos en p_ventana_seg segundos).
create function public.consumir_limite(p_clave text, p_max integer, p_ventana_seg integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_usos integer;
begin
  if p_max < 1 or p_ventana_seg < 1 or p_ventana_seg > 86400 then raise exception 'parametros_invalidos'; end if;
  -- Limpieza oportunista de registros viejos.
  delete from private.limites where creado_en < now() - interval '1 day';
  select count(*) into v_usos from private.limites
  where clave = p_clave and creado_en > now() - make_interval(secs => p_ventana_seg);
  if v_usos >= p_max then return false; end if;
  insert into private.limites (clave) values (p_clave);
  return true;
end;
$$;

-- Borra los usos de una clave (por ejemplo, al iniciar sesión correctamente).
create function public.reiniciar_limite(p_clave text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.limites where clave = p_clave;
$$;

revoke all on function public.consumir_limite(text, integer, integer) from public, anon, authenticated;
revoke all on function public.reiniciar_limite(text) from public, anon, authenticated;
grant execute on function public.consumir_limite(text, integer, integer) to service_role;
grant execute on function public.reiniciar_limite(text) to service_role;
