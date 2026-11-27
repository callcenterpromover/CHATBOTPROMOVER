-- Configuraciones (solo super_admin): además del bot de WhatsApp, el OCR y el modo simulación se
-- encienden y apagan desde el panel. Todo queda en la fila única de configuracion_bot.
--   ocr_activo: con el OCR pausado el worker sigue corriendo y enviando su señal, pero no toma
--               documentos; quedan en cola y se leen al reanudar.
--   simulacion: reemplaza la variable MODO_SIMULACION de Vercel. Muestra el simulador de WhatsApp
--               (solo números ficticios 5730000000xx). Arranca apagado.

alter table public.configuracion_bot
  add column ocr_activo boolean not null default true,
  add column simulacion boolean not null default false;

alter table public.auditoria drop constraint auditoria_accion_check;
alter table public.auditoria add constraint auditoria_accion_check check (accion in (
  'CERRAR_SOLICITUD', 'EXPORTAR_LISTA', 'TOMAR_SOLICITUD', 'DEVOLVER_SOLICITUD',
  'ASIGNAR_SOLICITUD', 'GESTION_USUARIO', 'CAMBIAR_ESTADO_BOT', 'CAMBIAR_ESTADO_OCR',
  'CAMBIAR_MODO_SIMULACION'));

create function public.cambiar_configuracion(p_clave text, p_valor boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select private.rol_actual()), '') <> 'super_admin' then
    raise exception 'no_autorizado';
  end if;
  case p_clave
    when 'bot' then
      update public.configuracion_bot set activo = p_valor, cambiado_por = (select auth.uid()), cambiado_en = now() where id = 1;
      perform private.auditar('CAMBIAR_ESTADO_BOT', case when p_valor then 'activar' else 'pausar' end);
    when 'ocr' then
      update public.configuracion_bot set ocr_activo = p_valor, cambiado_por = (select auth.uid()), cambiado_en = now() where id = 1;
      perform private.auditar('CAMBIAR_ESTADO_OCR', case when p_valor then 'activar' else 'pausar' end);
    when 'simulacion' then
      update public.configuracion_bot set simulacion = p_valor, cambiado_por = (select auth.uid()), cambiado_en = now() where id = 1;
      perform private.auditar('CAMBIAR_MODO_SIMULACION', case when p_valor then 'activar' else 'apagar' end);
    else
      raise exception 'clave_invalida';
  end case;
  return p_valor;
end;
$$;
revoke all on function public.cambiar_configuracion(text, boolean) from public, anon;
grant execute on function public.cambiar_configuracion(text, boolean) to authenticated;

-- Con el OCR pausado no se entrega ningún trabajo al worker.
create or replace function public.reclamar_trabajo_ocr()
returns setof public.trabajos_ocr
language sql
security invoker
set search_path = ''
as $$
  update public.trabajos_ocr
  set estado = 'EN_PROCESO', iniciado_en = now(), intentos = intentos + 1
  where id = (
    select id from public.trabajos_ocr
    where estado = 'PENDIENTE'
      and coalesce((select ocr_activo from public.configuracion_bot where id = 1), true)
    order by creado_en
    limit 1
    for update skip locked
  )
  returning *;
$$;

-- El resumen de Indicadores dice si el OCR está pausado desde Configuraciones.
create or replace function public.resumen_espera()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  w public.estado_worker;
  r jsonb;
begin
  if not (select private.es_operador()) then
    raise exception 'no_autorizado';
  end if;
  select * into w from public.estado_worker where id = 1;

  select jsonb_build_object(
    'total', count(*),
    'sin_asignar', count(*) filter (where asignado_a is null),
    'mas_de_15_dias', count(*) filter (where v_hoy - (creada_en at time zone 'America/Bogota')::date > 15),
    'por_eps', coalesce((
      select jsonb_object_agg(eps, n) from (
        select eps, count(*) as n from public.solicitudes group by eps
      ) e
    ), '{}'::jsonb),
    'casos_con_alerta_documental', (
      select count(distinct a.solicitud_id) from public.alertas a
      where not a.resuelta and a.codigo in (
        'DOCUMENTO_ILEGIBLE', 'DOCUMENTO_NO_PROCESABLE', 'HISTORIA_POSIBLEMENTE_INCOMPLETA',
        'DISCREPANCIA_DOCUMENTO', 'FECHA_VENCIMIENTO_NO_CONFIRMADA', 'ORDEN_PROXIMA_A_VENCER',
        'ORDEN_POSIBLEMENTE_VENCIDA', 'AUTORIZACION_POSIBLEMENTE_UTILIZADA')
    ),
    'ocr_pendientes', (select count(*) from public.trabajos_ocr where estado in ('PENDIENTE', 'EN_PROCESO')),
    'ocr_con_error', (select count(*) from public.trabajos_ocr where estado = 'ERROR'),
    'ocr_activo', coalesce((select ocr_activo from public.configuracion_bot where id = 1), true),
    'worker_estado', case
      when w.id is null then 'NUNCA'
      when w.detenido_en is not null and w.detenido_en >= w.ultimo_latido then 'APAGADO'
      when w.ultimo_latido > now() - interval '2 minutes' then 'ENCENDIDO'
      else 'SIN_SENAL'
    end,
    'worker_minutos_desde', case
      when w.id is null then null
      when w.detenido_en is not null and w.detenido_en >= w.ultimo_latido
        then extract(epoch from now() - w.detenido_en) / 60
      else extract(epoch from now() - w.ultimo_latido) / 60
    end,
    'worker_equipo', w.equipo
  ) into r
  from public.solicitudes;
  return r;
end;
$$;
