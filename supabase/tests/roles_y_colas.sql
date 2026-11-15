-- Prueba de roles, cola de trabajo y métricas diarias. No deja cambios: termina con una excepción
-- que revierte todo y trae el resultado en el mensaje. Requiere los datos ficticios de seed.sql.
do $$
declare
  v_op1 uuid := '00000000-0000-0000-0000-0000000000a1';
  v_op2 uuid := '00000000-0000-0000-0000-0000000000a2';
  v_adm uuid := '00000000-0000-0000-0000-0000000000a3';
  v_id uuid;
  r text := '';
  v_n int;
  v_b boolean;
begin
  insert into auth.users (id, email) values (v_op1, 'op1@prueba.test'), (v_op2, 'op2@prueba.test'), (v_adm, 'adm@prueba.test');
  insert into public.operadores (user_id, nombre, rol) values
    (v_op1, 'Operativo Uno', 'operativo'), (v_op2, 'Operativo Dos', 'operativo'), (v_adm, 'Admin', 'administrador');
  select id into v_id from public.solicitudes where documento = '1000000001' limit 1;
  update public.solicitudes set asignado_a = null where id = v_id;

  -- op1 no puede editar una solicitud libre
  perform set_config('request.jwt.claims', json_build_object('sub', v_op1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.solicitudes set nombre = 'X' where id = v_id;
  get diagnostics v_n = row_count;
  r := r || 'op1_edita_libre=' || v_n;

  -- op1 la toma; op2 no puede tomarla después
  r := r || ' | op1_toma=' || public.tomar_solicitud(v_id);
  perform set_config('request.jwt.claims', json_build_object('sub', v_op2, 'role', 'authenticated')::text, true);
  r := r || ' op2_toma=' || public.tomar_solicitud(v_id);
  update public.solicitudes set nombre = 'X' where id = v_id;
  get diagnostics v_n = row_count;
  r := r || ' op2_edita_ajena=' || v_n;
  r := r || ' op2_devuelve_ajena=' || public.devolver_solicitud(v_id);
  begin
    perform public.asignar_solicitud(v_id, v_op2);
    r := r || ' op2_asigna=SI(MAL)';
  exception when others then r := r || ' op2_asigna=' || sqlerrm;
  end;
  begin
    perform public.cerrar_solicitud(v_id, 'GESTIONADA');
    r := r || ' op2_cierra=SI(MAL)';
  exception when others then r := r || ' op2_cierra=' || sqlerrm;
  end;

  -- el administrador reasigna a op2
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  r := r || ' | admin_reasigna=' || public.asignar_solicitud(v_id, v_op2);

  -- op2 la cierra: se borra y suma en metricas_diarias
  perform set_config('request.jwt.claims', json_build_object('sub', v_op2, 'role', 'authenticated')::text, true);
  r := r || ' op2_cierra=' || (public.cerrar_solicitud(v_id, 'GESTIONADA') ->> 'eliminada');
  reset role;

  select r || format(' | metricas_hoy total=%s min>0=%s op2=%s eps=%s', total_gestionadas, minutos_espera_acumulados > 0,
                     casos_por_operador_json ->> v_op2::text, casos_por_eps_json)
    into r from public.metricas_diarias m
    where m.fecha = (now() at time zone 'America/Bogota')::date;
  select r || ' | auditoria=' || string_agg(accion, ',' order by id) into r
    from public.auditoria where operador in (v_op1, v_op2, v_adm);

  raise exception 'RESULTADO %', r;
end $$;
