-- Prueba de permisos y del cierre con borrado verificado.
-- No deja cambios: termina con una excepción que revierte todo y trae el resultado en el mensaje.
-- Requiere los datos ficticios de seed.sql.
do $$
declare
  v_anon text; v_noop int; v_noop_rpc text; v_id uuid; v_res jsonb;
  v_sol int; v_al int; v_ce int; v_tr int; v_otras int; v_met text;
begin
  -- 1) anon no puede leer
  begin
    set local role anon;
    perform count(*) from public.solicitudes;
    v_anon := 'LEE (MAL)';
  exception when insufficient_privilege then v_anon := 'denegado';
  end;
  reset role;

  -- 2) autenticado que NO es operador: no ve filas ni puede cerrar
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into v_noop from public.solicitudes;
  begin
    perform public.cerrar_solicitud((select gen_random_uuid()));
    v_noop_rpc := 'CERRO (MAL)';
  exception when others then v_noop_rpc := sqlerrm;
  end;
  reset role;

  -- 3) cierre real; se revierte al final
  select id into v_id from public.solicitudes where documento = '1000000007' and categoria_probable = 'FISIATRIA';
  v_res := public.cerrar_solicitud(v_id, 'GESTIONADA');
  select count(*) into v_sol from public.solicitudes;
  select count(*) into v_al from public.alertas where solicitud_id = v_id;
  select count(*) into v_ce from public.campos_extraidos where solicitud_id = v_id;
  select count(*) into v_tr from public.trabajos_ocr where solicitud_id = v_id;
  select count(*) into v_otras from public.solicitudes where documento = '1000000007';
  select string_agg(format('%s/%s/%s/%s total=%s dias=%s', mes, eps, categoria, motivo, total, suma_dias_espera), '; ')
    into v_met from public.metricas_cierre;

  raise exception 'RESULTADO anon=% | no_operador_ve=% rpc=% | cierre=% solicitudes_restantes=% alertas=% campos=% trabajos=% otra_del_mismo_paciente=% | metricas=%',
    v_anon, v_noop, v_noop_rpc, v_res, v_sol, v_al, v_ce, v_tr, v_otras, v_met;
end $$;
