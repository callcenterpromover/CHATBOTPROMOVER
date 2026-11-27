-- Registro de errores técnicos para el panel del super_admin («Registro de errores»).
-- Solo códigos técnicos y detalles cortos: nunca teléfonos, nombres, documentos ni texto de mensajes.
-- El mismo error repetido en menos de 10 minutos suma en `repeticiones` en lugar de crear filas nuevas,
-- así un webhook mal configurado (o alguien enviando peticiones falsas) no llena la tabla.

create table public.registro_errores (
  id bigint generated always as identity primary key,
  origen text not null check (origen in ('webhook', 'envio', 'bot', 'ocr', 'worker', 'sistema')),
  codigo text not null check (char_length(codigo) between 1 and 80),
  detalle text check (char_length(detalle) <= 300),
  repeticiones integer not null default 1 check (repeticiones > 0),
  primero_en timestamptz not null default now(),
  ultimo_en timestamptz not null default now(),
  revisado boolean not null default false,
  revisado_por uuid references auth.users (id) on delete set null,
  revisado_en timestamptz
);
create index registro_errores_ultimo_idx on public.registro_errores (ultimo_en desc);
create index registro_errores_codigo_idx on public.registro_errores (origen, codigo, ultimo_en desc);

alter table public.registro_errores enable row level security;
revoke all on public.registro_errores from anon, authenticated;
grant select on public.registro_errores to authenticated;
grant select, insert, update, delete on public.registro_errores to service_role;
create policy registro_errores_ver on public.registro_errores
  for select to authenticated using ((select private.rol_actual()) = 'super_admin');

-- Escritura desde el servidor (webhook, bot, avisos del worker). Agrupa repeticiones y purga lo viejo.
create function public.registrar_error(p_origen text, p_codigo text, p_detalle text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  select id into v_id from public.registro_errores
  where origen = p_origen and codigo = left(p_codigo, 80) and not revisado
    and ultimo_en > now() - interval '10 minutes'
  order by ultimo_en desc
  limit 1;

  if v_id is null then
    insert into public.registro_errores (origen, codigo, detalle)
    values (p_origen, left(p_codigo, 80), left(p_detalle, 300));
  else
    update public.registro_errores
    set repeticiones = repeticiones + 1, ultimo_en = now(), detalle = coalesce(left(p_detalle, 300), detalle)
    where id = v_id;
  end if;

  -- Se conservan 30 días.
  delete from public.registro_errores where ultimo_en < now() - interval '30 days';
end;
$$;
revoke all on function public.registrar_error(text, text, text) from public, anon, authenticated;
grant execute on function public.registrar_error(text, text, text) to service_role;

alter table public.auditoria drop constraint auditoria_accion_check;
alter table public.auditoria add constraint auditoria_accion_check check (accion in (
  'CERRAR_SOLICITUD', 'EXPORTAR_LISTA', 'TOMAR_SOLICITUD', 'DEVOLVER_SOLICITUD',
  'ASIGNAR_SOLICITUD', 'GESTION_USUARIO', 'CAMBIAR_ESTADO_BOT', 'GESTION_AGENDAS', 'REVISAR_ERRORES'));

-- Marca como revisados todos los registros abiertos de un código (o todos si p_codigo es null).
create function public.marcar_errores_revisados(p_origen text default null, p_codigo text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if coalesce((select private.rol_actual()), '') <> 'super_admin' then
    raise exception 'no_autorizado';
  end if;
  update public.registro_errores
  set revisado = true, revisado_por = (select auth.uid()), revisado_en = now()
  where not revisado
    and (p_origen is null or origen = p_origen)
    and (p_codigo is null or codigo = p_codigo);
  get diagnostics v_n = row_count;
  perform private.auditar('REVISAR_ERRORES', coalesce(p_codigo, 'todos'));
  return v_n;
end;
$$;
revoke all on function public.marcar_errores_revisados(text, text) from public, anon;
grant execute on function public.marcar_errores_revisados(text, text) to authenticated;

-- Señales de salud del sistema para el diagnóstico (solo super_admin). Sin datos de pacientes.
create function public.diagnostico_sistema()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r jsonb;
begin
  if coalesce((select private.rol_actual()), '') <> 'super_admin' then
    raise exception 'no_autorizado';
  end if;
  select jsonb_build_object(
    'bot_activo', coalesce((select activo from public.configuracion_bot where id = 1), false),
    'bot_cambiado_en', (select cambiado_en from public.configuracion_bot where id = 1),
    'ultimo_mensaje_recibido', (select max(recibido_en) from public.mensajes_procesados),
    'mensajes_24h', (select count(*) from public.mensajes_procesados where recibido_en > now() - interval '24 hours'),
    'worker_ultimo_latido', (select ultimo_latido from public.estado_worker where id = 1),
    'worker_equipo', (select equipo from public.estado_worker where id = 1),
    'ocr_pendientes', (select count(*) from public.trabajos_ocr where estado in ('PENDIENTE', 'EN_PROCESO')),
    'ocr_con_error', (select count(*) from public.trabajos_ocr where estado = 'ERROR'),
    'ocr_errores_por_codigo', coalesce((
      select jsonb_object_agg(c, n) from (
        select coalesce(error_codigo, 'sin_codigo') as c, count(*) as n
        from public.trabajos_ocr where estado = 'ERROR' group by 1
      ) x
    ), '{}'::jsonb)
  ) into r;
  return r;
end;
$$;
revoke all on function public.diagnostico_sistema() from public, anon;
grant execute on function public.diagnostico_sistema() to authenticated;
