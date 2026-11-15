-- Visibilidad por rol: un operativo solo ve la bolsa general (sin asignar) y su propia cola.
-- Las colas de otras personas solo las ven super_admin y administrador. Se aplica en la base
-- (RLS), así que vale para cualquier pantalla, exportación o consulta directa a la API.

create function private.puede_ver(p_solicitud uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.es_operador()) and (
    (select private.es_admin())
    or exists (
      select 1 from public.solicitudes s
      where s.id = p_solicitud and (s.asignado_a is null or s.asignado_a = (select auth.uid()))
    )
  );
$$;
revoke all on function private.puede_ver(uuid) from public, anon;
grant execute on function private.puede_ver(uuid) to authenticated, service_role;

drop policy solicitudes_ver on public.solicitudes;
create policy solicitudes_ver on public.solicitudes
  for select to authenticated
  using (
    (select private.es_operador())
    and ((select private.es_admin()) or asignado_a is null or asignado_a = (select auth.uid()))
  );

drop policy campos_ver on public.campos_extraidos;
create policy campos_ver on public.campos_extraidos
  for select to authenticated using ((select private.puede_ver(solicitud_id)));

drop policy alertas_ver on public.alertas;
create policy alertas_ver on public.alertas
  for select to authenticated using ((select private.puede_ver(solicitud_id)));

drop policy observaciones_ver on public.observaciones;
create policy observaciones_ver on public.observaciones
  for select to authenticated using ((select private.puede_ver(solicitud_id)));

drop policy trabajos_ver on public.trabajos_ocr;
create policy trabajos_ver on public.trabajos_ocr
  for select to authenticated using ((select private.puede_ver(solicitud_id)));

drop policy historial_ver on public.historial_estados;
create policy historial_ver on public.historial_estados
  for select to authenticated using ((select private.puede_ver(solicitud_id)));

-- Totales para el dashboard: solo números, sin datos de pacientes ni de quién tiene cada caso, así
-- un operativo ve el tamaño de la espera sin ver las colas ajenas.
create function public.resumen_espera()
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
    )
  ) into r
  from public.solicitudes;
  return r;
end;
$$;
revoke all on function public.resumen_espera() from public, anon;
grant execute on function public.resumen_espera() to authenticated;
