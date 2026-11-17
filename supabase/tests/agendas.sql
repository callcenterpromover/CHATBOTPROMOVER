-- Prueba de permisos y validaciones de Agendas. No deja cambios: termina con una excepción
-- que revierte todo y trae el resultado en el mensaje.
do $$
declare
  v_op uuid := '00000000-0000-0000-0000-0000000000b1';
  v_adm uuid := '00000000-0000-0000-0000-0000000000b2';
  v_fono smallint;
  v_tf_sos smallint;
  r text := '';
  v_n int;
begin
  insert into auth.users (id, email) values (v_op, 'op@prueba.test'), (v_adm, 'adm@prueba.test');
  insert into public.operadores (user_id, nombre, rol) values (v_op, 'Operativo', 'operativo'), (v_adm, 'Admin', 'administrador');
  select id into v_fono from public.servicios_cita where codigo = 'VAL_FONO';
  select id into v_tf_sos from public.servicios_cita where codigo = 'TF_SOS';

  -- Operativo: lee, pero no puede guardar ni escribir directo.
  perform set_config('request.jwt.claims', json_build_object('sub', v_op, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.servicios_cita;
  r := r || 'op_ve=' || v_n;
  begin
    perform public.guardar_franjas(v_fono, 'NINOS', '[]'::jsonb);
    r := r || ' op_guarda=SI';
  exception when others then r := r || ' op_guarda=' || sqlerrm;
  end;
  begin
    update public.servicios_cita set duracion_min = 99 where id = v_fono;
    get diagnostics v_n = row_count;
    r := r || ' op_update=' || v_n;
  exception when others then r := r || ' op_update=denegado';
  end;

  -- Administrador: guarda, y las validaciones rechazan errores.
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  r := r || ' | adm_guarda=' || public.guardar_franjas(v_fono, 'NINOS', '[{"dia":1,"inicio":"07:00","fin":"08:45"}]'::jsonb);
  begin
    perform public.guardar_franjas(v_fono, 'TODOS', '[]'::jsonb);
  exception when others then r := r || ' grupo=' || sqlerrm;
  end;
  begin
    perform public.guardar_franjas(v_fono, 'NINOS', '[{"dia":1,"inicio":"07:00","fin":"08:00"},{"dia":1,"inicio":"07:30","fin":"09:00"}]'::jsonb);
  exception when others then r := r || ' cruzadas=' || sqlerrm;
  end;
  begin
    perform public.guardar_franjas(v_fono, 'NINOS', '[{"dia":1,"inicio":"07:00","fin":"07:10"}]'::jsonb);
  exception when others then r := r || ' corta=' || sqlerrm;
  end;
  begin
    -- Terapia física SOS el martes en la mañana choca con especialistas.
    perform public.guardar_franjas(v_tf_sos, 'TODOS', '[{"dia":2,"inicio":"08:00","fin":"10:00"}]'::jsonb);
  exception when others then r := r || ' sos=' || sqlerrm;
  end;
  begin
    perform public.guardar_config_agenda(14::smallint);
    r := r || ' corte=' || (select edad_corte_ninos from public.configuracion_agenda);
  exception when others then r := r || ' corte=' || sqlerrm;
  end;

  raise exception 'RESULTADO %', r;
end $$;
