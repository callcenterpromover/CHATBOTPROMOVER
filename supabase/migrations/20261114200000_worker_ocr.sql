-- Soporte para el worker local de OCR (usa la clave secreta = rol service_role).

-- El backend (worker y, más adelante, el webhook) opera con service_role.
grant select, insert, update, delete on all tables in schema public to service_role;

-- Guarda el resultado de un trabajo en una sola transacción.
-- Devuelve false si el trabajo ya no existe o no está en proceso (por ejemplo, la solicitud
-- se cerró mientras se procesaba): en ese caso el worker descarta todo.
create function public.guardar_resultado_ocr(p_trabajo_id bigint, p_resultado jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sol uuid;
  s jsonb := coalesce(p_resultado -> 'solicitud', '{}'::jsonb);
begin
  select solicitud_id into v_sol
  from public.trabajos_ocr
  where id = p_trabajo_id and estado = 'EN_PROCESO'
  for update;
  if v_sol is null then
    return false;
  end if;

  update public.trabajos_ocr set
    estado = p_resultado ->> 'estado',
    tipo_documento = coalesce(p_resultado ->> 'tipo_documento', tipo_documento),
    legibilidad = p_resultado ->> 'legibilidad',
    pagina_actual = (p_resultado ->> 'pagina_actual')::integer,
    pagina_total = (p_resultado ->> 'pagina_total')::integer,
    error_codigo = p_resultado ->> 'error_codigo',
    terminado_en = now()
  where id = p_trabajo_id;

  insert into public.campos_extraidos (solicitud_id, campo, origen, valor_ocr, confianza, verificacion)
  select v_sol, c ->> 'campo', c ->> 'origen', left(c ->> 'valor_ocr', 200), c ->> 'confianza',
         coalesce(c ->> 'verificacion', 'SIN_COMPARAR')
  from jsonb_array_elements(coalesce(p_resultado -> 'campos', '[]'::jsonb)) c;

  -- No repetir una alerta abierta con el mismo código.
  insert into public.alertas (solicitud_id, codigo, detalle)
  select v_sol, a ->> 'codigo', a ->> 'detalle'
  from jsonb_array_elements(coalesce(p_resultado -> 'alertas', '[]'::jsonb)) a
  where not exists (
    select 1 from public.alertas x
    where x.solicitud_id = v_sol and x.codigo = a ->> 'codigo' and not x.resuelta
  );

  update public.solicitudes set
    estado = coalesce(s ->> 'estado', estado),
    orden_estado = coalesce(s ->> 'orden_estado', orden_estado),
    historia_estado = coalesce(s ->> 'historia_estado', historia_estado),
    plan_estado = coalesce(s ->> 'plan_estado', plan_estado),
    autorizacion_estado = coalesce(s ->> 'autorizacion_estado', autorizacion_estado),
    categoria_probable = coalesce(s ->> 'categoria_probable', categoria_probable),
    clasificacion_motivo = coalesce(s ->> 'clasificacion_motivo', clasificacion_motivo),
    clasificacion_confianza = coalesce(s ->> 'clasificacion_confianza', clasificacion_confianza),
    orden_vencimiento = coalesce((s ->> 'orden_vencimiento')::date, orden_vencimiento),
    orden_vencimiento_texto = coalesce(s ->> 'orden_vencimiento_texto', orden_vencimiento_texto),
    orden_vencimiento_confianza = coalesce(s ->> 'orden_vencimiento_confianza', orden_vencimiento_confianza)
  where id = v_sol;

  return true;
end;
$$;

revoke all on function public.guardar_resultado_ocr(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.guardar_resultado_ocr(bigint, jsonb) to service_role;
