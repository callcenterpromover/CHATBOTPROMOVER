-- Roles (RBAC), cola de trabajo con asignación y métricas diarias anónimas.
--
-- Decisiones:
-- * El rol vive en la tabla `operadores`, NO en user_metadata: el usuario puede editar su propio
--   user_metadata, así que no sirve para autorizar.
-- * La asignación se hace solo con funciones (tomar/devolver/asignar), que verifican permisos y
--   evitan que dos personas tomen la misma solicitud (UPDATE ... WHERE asignado_a IS NULL).
-- * El borrado al cerrar sigue siendo public.cerrar_solicitud (DELETE verificado); las métricas
--   se actualizan en el trigger BEFORE DELETE, justo antes de la purga.

-- ---------------------------------------------------------------------------- roles
alter table public.operadores
  add column rol text not null default 'operativo'
  check (rol in ('super_admin', 'administrador', 'operativo'));

create function private.rol_actual()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select o.rol from public.operadores o where o.user_id = (select auth.uid()) and o.activo;
$$;

create function private.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.rol_actual()) in ('super_admin', 'administrador'), false);
$$;

revoke all on function private.rol_actual(), private.es_admin() from public, anon;
grant execute on function private.rol_actual(), private.es_admin() to authenticated, service_role;

-- Los operadores ven la lista de compañeros (nombre y rol) para asignar casos y para el dashboard.
drop policy operadores_ver_propio on public.operadores;
create policy operadores_ver on public.operadores
  for select to authenticated using ((select private.es_operador()));
grant select, insert, update on public.operadores to service_role;

-- ---------------------------------------------------------------------------- asignación
alter table public.solicitudes
  add column asignado_a uuid references auth.users (id) on delete set null,
  add column fecha_asignacion timestamptz,
  add column estado_concurrencia text
    generated always as (case when asignado_a is null then 'LIBRE' else 'BLOQUEADO' end) stored;
create index solicitudes_asignado_idx on public.solicitudes (asignado_a);

-- Quién puede modificar una solicitud: un administrador, o la persona que la tiene asignada.
create function private.puede_editar(p_solicitud uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.es_admin())
      or exists (
        select 1 from public.solicitudes s
        where s.id = p_solicitud and s.asignado_a = (select auth.uid()) and (select private.es_operador())
      );
$$;
revoke all on function private.puede_editar(uuid) from public, anon;
grant execute on function private.puede_editar(uuid) to authenticated, service_role;

drop policy solicitudes_editar on public.solicitudes;
create policy solicitudes_editar on public.solicitudes
  for update to authenticated
  using ((select private.es_admin()) or (asignado_a = (select auth.uid()) and (select private.es_operador())))
  with check ((select private.es_admin()) or (asignado_a = (select auth.uid()) and (select private.es_operador())));

drop policy solicitudes_borrar on public.solicitudes;
create policy solicitudes_borrar on public.solicitudes
  for delete to authenticated
  using ((select private.es_admin()) or (asignado_a = (select auth.uid()) and (select private.es_operador())));

drop policy campos_editar on public.campos_extraidos;
create policy campos_editar on public.campos_extraidos
  for update to authenticated
  using ((select private.puede_editar(solicitud_id))) with check ((select private.puede_editar(solicitud_id)));

drop policy alertas_editar on public.alertas;
create policy alertas_editar on public.alertas
  for update to authenticated
  using ((select private.puede_editar(solicitud_id))) with check ((select private.puede_editar(solicitud_id)));

drop policy observaciones_crear on public.observaciones;
create policy observaciones_crear on public.observaciones
  for insert to authenticated
  with check ((select private.puede_editar(solicitud_id)) and autor = (select auth.uid()));

drop policy observaciones_borrar on public.observaciones;
create policy observaciones_borrar on public.observaciones
  for delete to authenticated using ((select private.puede_editar(solicitud_id)));

-- Auditoría de la cola (sin datos de pacientes).
alter table public.auditoria drop constraint auditoria_accion_check;
alter table public.auditoria add constraint auditoria_accion_check check (accion in (
  'CERRAR_SOLICITUD', 'EXPORTAR_LISTA', 'TOMAR_SOLICITUD', 'DEVOLVER_SOLICITUD',
  'ASIGNAR_SOLICITUD', 'GESTION_USUARIO'));
grant insert on public.auditoria to service_role;

-- Tomar una solicitud libre. Devuelve false si otra persona la tomó primero.
create function public.tomar_solicitud(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.es_operador()) then
    raise exception 'no_autorizado';
  end if;
  update public.solicitudes
  set asignado_a = (select auth.uid()), fecha_asignacion = now()
  where id = p_id and asignado_a is null;
  if not found then
    return false;
  end if;
  perform private.auditar('TOMAR_SOLICITUD', null);
  return true;
end;
$$;

-- Devolver a la bolsa general: quien la tiene asignada, o un administrador.
create function public.devolver_solicitud(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.es_operador()) then
    raise exception 'no_autorizado';
  end if;
  update public.solicitudes
  set asignado_a = null, fecha_asignacion = null
  where id = p_id and asignado_a is not null
    and (asignado_a = (select auth.uid()) or (select private.es_admin()));
  if not found then
    return false;
  end if;
  perform private.auditar('DEVOLVER_SOLICITUD', null);
  return true;
end;
$$;

-- Asignar o reasignar a un operador activo: solo administradores.
create function public.asignar_solicitud(p_id uuid, p_usuario uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.es_admin()) then
    raise exception 'no_autorizado';
  end if;
  if not exists (select 1 from public.operadores where user_id = p_usuario and activo) then
    raise exception 'usuario_invalido';
  end if;
  update public.solicitudes
  set asignado_a = p_usuario, fecha_asignacion = now()
  where id = p_id;
  if not found then
    return false;
  end if;
  perform private.auditar('ASIGNAR_SOLICITUD', null);
  return true;
end;
$$;

revoke all on function public.tomar_solicitud(uuid), public.devolver_solicitud(uuid),
  public.asignar_solicitud(uuid, uuid) from public, anon;
grant execute on function public.tomar_solicitud(uuid), public.devolver_solicitud(uuid),
  public.asignar_solicitud(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------- métricas diarias
-- Agregados anónimos: sin nombres, documentos ni IDs de solicitud. La clave de operador es el ID
-- del usuario del personal (no del paciente).
create table public.metricas_diarias (
  fecha date primary key,
  total_gestionadas integer not null default 0,
  minutos_espera_acumulados bigint not null default 0,
  casos_por_operador_json jsonb not null default '{}'::jsonb,
  casos_por_eps_json jsonb not null default '{}'::jsonb
);
alter table public.metricas_diarias enable row level security;
revoke all on public.metricas_diarias from anon, authenticated;
grant select on public.metricas_diarias to authenticated;
grant select, insert, update on public.metricas_diarias to service_role;
create policy metricas_diarias_ver on public.metricas_diarias
  for select to authenticated using ((select private.es_operador()));

create or replace function private.registrar_cierre()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := coalesce(nullif(current_setting('app.motivo_cierre', true), ''), 'SIN_MOTIVO');
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_dias integer := v_hoy - (old.creada_en at time zone 'America/Bogota')::date;
  v_minutos bigint := greatest(0, floor(extract(epoch from (now() - old.creada_en)) / 60))::bigint;
  v_operador text := coalesce((select auth.uid())::text, old.asignado_a::text, 'sistema');
begin
  insert into public.metricas_cierre (mes, eps, categoria, motivo, total, suma_dias_espera)
  values (date_trunc('month', v_hoy)::date, old.eps, old.categoria_probable, v_motivo, 1, v_dias)
  on conflict (mes, eps, categoria, motivo)
  do update set total = public.metricas_cierre.total + 1,
                suma_dias_espera = public.metricas_cierre.suma_dias_espera + excluded.suma_dias_espera;

  -- Solo los casos gestionados cuentan para los indicadores de la jornada.
  if v_motivo = 'GESTIONADA' then
    insert into public.metricas_diarias as m
      (fecha, total_gestionadas, minutos_espera_acumulados, casos_por_operador_json, casos_por_eps_json)
    values (v_hoy, 1, v_minutos, jsonb_build_object(v_operador, 1), jsonb_build_object(old.eps, 1))
    on conflict (fecha) do update set
      total_gestionadas = m.total_gestionadas + 1,
      minutos_espera_acumulados = m.minutos_espera_acumulados + excluded.minutos_espera_acumulados,
      casos_por_operador_json = jsonb_set(m.casos_por_operador_json, array[v_operador],
        to_jsonb(coalesce((m.casos_por_operador_json ->> v_operador)::integer, 0) + 1)),
      casos_por_eps_json = jsonb_set(m.casos_por_eps_json, array[old.eps],
        to_jsonb(coalesce((m.casos_por_eps_json ->> old.eps)::integer, 0) + 1));
  end if;
  return old;
end;
$$;

-- ---------------------------------------------------------------------------- vista
-- Se recrea para incluir la asignación (las vistas fijan sus columnas al crearse).
drop view public.lista_espera;
create view public.lista_espera
with (security_invoker = true)
as
select
  s.*,
  o.nombre as asignado_nombre,
  (now() at time zone 'America/Bogota')::date - (s.creada_en at time zone 'America/Bogota')::date
    as dias_espera,
  case when s.orden_vencimiento is not null
    then s.orden_vencimiento - (now() at time zone 'America/Bogota')::date
  end as dias_para_vencer,
  coalesce(a.abiertas, 0) as alertas_abiertas,
  coalesce(c.discrepancias, 0) as discrepancias,
  case when s.documento is not null
    then count(*) over (partition by s.documento)
    else 1
  end as solicitudes_mismo_documento,
  case
    when coalesce(c.discrepancias, 0) > 0 then 'DISCREPANCIA'
    when s.historia_estado = 'POSIBLEMENTE_INCOMPLETA' then 'POSIBLEMENTE_INCOMPLETA'
    when s.orden_estado in ('LEGIBLE', 'CONFIRMADA_HUMANAMENTE')
     and s.historia_estado in ('RECIBIDA_PENDIENTE_REVISION', 'COMPLETITUD_CONFIRMADA_HUMANAMENTE')
     and s.plan_estado <> 'REQUERIDO_PENDIENTE' then 'COMPLETO'
    else 'INCOMPLETO'
  end as estado_documental
from public.solicitudes s
left join public.operadores o on o.user_id = s.asignado_a
left join lateral (
  select count(*) as abiertas from public.alertas al
  where al.solicitud_id = s.id and not al.resuelta
) a on true
left join lateral (
  select count(*) as discrepancias from public.campos_extraidos ce
  where ce.solicitud_id = s.id and ce.verificacion = 'DISCREPANCIA'
) c on true;

revoke all on public.lista_espera from anon, authenticated;
grant select on public.lista_espera to authenticated;
grant select on public.lista_espera to service_role;
