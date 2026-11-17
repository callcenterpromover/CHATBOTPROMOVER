-- Interruptor del bot de WhatsApp. Solo super_admin puede pausarlo o encenderlo.
-- Arranca PAUSADO: el proyecto está detenido mientras se calibra el OCR.

create table public.configuracion_bot (
  id smallint primary key default 1 check (id = 1),
  activo boolean not null default false,
  cambiado_por uuid references auth.users (id) on delete set null,
  cambiado_en timestamptz not null default now()
);
insert into public.configuracion_bot (id, activo) values (1, false);

alter table public.configuracion_bot enable row level security;
revoke all on public.configuracion_bot from anon, authenticated;
grant select on public.configuracion_bot to authenticated;
grant select, update on public.configuracion_bot to service_role;
create policy configuracion_bot_ver on public.configuracion_bot
  for select to authenticated using ((select private.es_operador()));

alter table public.auditoria drop constraint auditoria_accion_check;
alter table public.auditoria add constraint auditoria_accion_check check (accion in (
  'CERRAR_SOLICITUD', 'EXPORTAR_LISTA', 'TOMAR_SOLICITUD', 'DEVOLVER_SOLICITUD',
  'ASIGNAR_SOLICITUD', 'GESTION_USUARIO', 'CAMBIAR_ESTADO_BOT'));

create function public.cambiar_estado_bot(p_activo boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select private.rol_actual()), '') <> 'super_admin' then
    raise exception 'no_autorizado';
  end if;
  update public.configuracion_bot
  set activo = p_activo, cambiado_por = (select auth.uid()), cambiado_en = now()
  where id = 1;
  perform private.auditar('CAMBIAR_ESTADO_BOT', case when p_activo then 'activar' else 'pausar' end);
  return p_activo;
end;
$$;
revoke all on function public.cambiar_estado_bot(boolean) from public, anon;
grant execute on function public.cambiar_estado_bot(boolean) to authenticated;
