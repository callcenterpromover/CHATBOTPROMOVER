-- El worker registra cuándo se apaga, y el estado se calcula con la hora de la base (no la del
-- navegador ni la de Vercel): ENCENDIDO, APAGADO o SIN_SENAL (se cerró sin avisar o el equipo se apagó).

alter table public.estado_worker add column detenido_en timestamptz;

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
