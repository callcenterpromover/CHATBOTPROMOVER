-- Endurecimiento de seguridad: mínimo privilegio por columna, valores por defecto seguros y
-- registro de auditoría sin datos de pacientes.

-- 1) El panel solo puede modificar las columnas que realmente edita. Teléfono, fechas de
--    creación, autorización y campos del worker quedan fuera del alcance de un operador.
revoke update on public.solicitudes from authenticated;
grant update (
  estado, categoria_probable, eps, orden_estado, historia_estado, plan_estado,
  autorizacion_estado, revision_humana, nombre, documento, cita_previa_fecha
) on public.solicitudes to authenticated;

-- 2) Las tablas y secuencias que se creen en adelante no quedan expuestas por defecto.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- 3) Auditoría: quién cerró o exportó y cuándo. Sin nombres, documentos ni números de solicitud,
--    para que no sirva para reidentificar a un paciente después del borrado.
create table public.auditoria (
  id bigint generated always as identity primary key,
  en timestamptz not null default now(),
  operador uuid,
  accion text not null check (accion in ('CERRAR_SOLICITUD', 'EXPORTAR_LISTA')),
  detalle text check (char_length(detalle) <= 60)
);
create index auditoria_en_idx on public.auditoria (en);

alter table public.auditoria enable row level security;
revoke all on public.auditoria from anon, authenticated;
grant select on public.auditoria to authenticated;
grant select, insert on public.auditoria to service_role;
create policy auditoria_ver on public.auditoria
  for select to authenticated using ((select private.es_operador()));

-- Solo se puede escribir en la auditoría a través de esta función (esquema no expuesto por la API).
create function private.auditar(p_accion text, p_detalle text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.auditoria (operador, accion, detalle)
  values ((select auth.uid()), p_accion, left(p_detalle, 60));
$$;
revoke all on function private.auditar(text, text) from public, anon;
grant execute on function private.auditar(text, text) to authenticated, service_role;

create function public.registrar_exportacion(p_filas integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select private.es_operador()) then
    raise exception 'no_autorizado';
  end if;
  perform private.auditar('EXPORTAR_LISTA', greatest(p_filas, 0)::text || ' filas');
end;
$$;
revoke all on function public.registrar_exportacion(integer) from public, anon;
grant execute on function public.registrar_exportacion(integer) to authenticated;

-- Cuenta lo que queda vinculado a una solicitud en TODAS las tablas, incluidas las que el
-- operador no puede leer (conversaciones). Solo devuelve un número.
create function private.contar_restos(p_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
      (select count(*) from public.solicitudes where id = p_id)
    + (select count(*) from public.campos_extraidos where solicitud_id = p_id)
    + (select count(*) from public.alertas where solicitud_id = p_id)
    + (select count(*) from public.observaciones where solicitud_id = p_id)
    + (select count(*) from public.trabajos_ocr where solicitud_id = p_id)
    + (select count(*) from public.historial_estados where solicitud_id = p_id)
    + (select count(*) from public.conversaciones where solicitud_id = p_id)
  )::integer;
$$;
revoke all on function private.contar_restos(uuid) from public, anon;
grant execute on function private.contar_restos(uuid) to authenticated, service_role;

-- El cierre queda registrado en la auditoría (solo el motivo).
create or replace function public.cerrar_solicitud(p_id uuid, p_motivo text default 'GESTIONADA')
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_borradas integer;
  v_restos integer;
begin
  if p_motivo not in ('GESTIONADA', 'CERRADA_DUPLICADA', 'CERRADA_POR_USUARIO') then
    raise exception 'motivo_invalido';
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
