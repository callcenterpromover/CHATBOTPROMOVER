-- Señal de vida del worker de OCR, para ver en el dashboard si está funcionando.

create table public.estado_worker (
  id smallint primary key default 1 check (id = 1),
  ultimo_latido timestamptz not null default now(),
  equipo text check (char_length(equipo) <= 60),
  iniciado_en timestamptz,
  procesados_desde_inicio integer not null default 0
);
alter table public.estado_worker enable row level security;
revoke all on public.estado_worker from anon, authenticated;
grant select, insert, update on public.estado_worker to service_role;

-- Los totales del dashboard incluyen ahora la cola de OCR y el último latido del worker.
create or replace function public.resumen_espera()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  r jsonb;
begin
  if not (select private.es_operador()) then
    raise exception 'no_autorizado';
  end if;
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
    'worker_ultimo_latido', (select ultimo_latido from public.estado_worker where id = 1),
    'worker_equipo', (select equipo from public.estado_worker where id = 1)
  ) into r
  from public.solicitudes;
  return r;
end;
$$;
