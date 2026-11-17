-- Agendas: servicios de cita, franjas de atención y lineamientos de agendamiento
-- (docs/lineamientos_agendamiento_promover.md). Todo se edita desde el panel /admin/agendas
-- (solo administradores) mediante funciones que validan y auditan. El bot solo lee.

create table public.servicios_cita (
  id smallint generated always as identity primary key,
  codigo text not null unique check (codigo ~ '^[A-Z0-9_]{2,40}$'),
  nombre text not null check (char_length(nombre) between 3 and 80),
  nombre_visoft text check (char_length(nombre_visoft) <= 160),
  duracion_min smallint not null check (duracion_min between 5 and 240),
  eps text not null check (eps in ('TODAS', 'SALUD_TOTAL', 'SOS')),
  menu text not null default 'PRINCIPAL' check (menu in ('PRINCIPAL', 'ESPECIALISTAS')),
  por_grupo_edad boolean not null default false,
  edad_minima smallint check (edad_minima between 0 and 120),
  agenda text check (agenda in ('FISIO_SOS', 'ESPECIALISTAS_SOS')),
  autorizacion_salud_total text not null default 'NO' check (autorizacion_salud_total in ('SIEMPRE', 'MENORES', 'CONDICIONAL', 'NO')),
  autorizacion_sos text not null default 'NO' check (autorizacion_sos in ('SIEMPRE', 'MENORES', 'CONDICIONAL', 'NO')),
  ubicacion text check (char_length(ubicacion) <= 160),
  profesional text check (char_length(profesional) <= 120),
  notas_equipo text check (char_length(notas_equipo) <= 600),
  orden smallint not null default 0,
  activo boolean not null default true,
  actualizado_en timestamptz not null default now()
);

create table public.franjas_horario (
  id bigint generated always as identity primary key,
  servicio_id smallint not null references public.servicios_cita (id) on delete cascade,
  grupo_edad text not null default 'TODOS' check (grupo_edad in ('TODOS', 'NINOS', 'ADULTOS')),
  dia_semana smallint not null check (dia_semana between 1 and 7), -- 1 = lunes
  hora_inicio time not null,
  hora_fin time not null,
  check (hora_fin > hora_inicio)
);
create index franjas_horario_servicio_idx on public.franjas_horario (servicio_id, grupo_edad, dia_semana);

create table public.ips_sos (
  id smallint generated always as identity primary key,
  nombre text not null unique check (char_length(nombre) between 2 and 80),
  es_primaria boolean not null default false,
  requiere_ops boolean not null default false,
  nota text check (char_length(nota) <= 300),
  orden smallint not null default 0,
  activo boolean not null default true
);

create table public.lineamientos_generales (
  id smallint generated always as identity primary key,
  titulo text not null check (char_length(titulo) between 3 and 80),
  texto text not null check (char_length(texto) between 3 and 600),
  aplica_eps text not null default 'TODAS' check (aplica_eps in ('TODAS', 'SALUD_TOTAL', 'SOS')),
  solo_menores boolean not null default false,
  orden smallint not null default 0,
  activo boolean not null default true
);

create table public.configuracion_agenda (
  id smallint primary key default 1 check (id = 1),
  edad_corte_ninos smallint not null default 18 check (edad_corte_ninos between 1 and 30),
  actualizado_en timestamptz not null default now()
);
insert into public.configuracion_agenda (id) values (1);

alter table public.solicitudes
  add column servicio_cita_id smallint references public.servicios_cita (id) on delete set null;
create index solicitudes_servicio_cita_idx on public.solicitudes (servicio_cita_id);

-- Lectura para operadores; nadie escribe directo (solo las funciones de abajo y el service_role).
do $$
declare t text;
begin
  foreach t in array array['servicios_cita', 'franjas_horario', 'ips_sos', 'lineamientos_generales', 'configuracion_agenda'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select on public.%I to service_role', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.es_operador()))', t || '_ver', t);
  end loop;
end $$;

alter table public.auditoria drop constraint auditoria_accion_check;
alter table public.auditoria add constraint auditoria_accion_check check (accion in (
  'CERRAR_SOLICITUD', 'EXPORTAR_LISTA', 'TOMAR_SOLICITUD', 'DEVOLVER_SOLICITUD',
  'ASIGNAR_SOLICITUD', 'GESTION_USUARIO', 'CAMBIAR_ESTADO_BOT', 'GESTION_AGENDAS'));

-- ¿Alguna franja de fisioterapia SOS se cruza con una de especialistas SOS? (misma agenda del fisioterapeuta)
create function private.hay_cruce_agenda_sos()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.franjas_horario a
    join public.servicios_cita sa on sa.id = a.servicio_id and sa.activo and sa.agenda = 'FISIO_SOS'
    join public.franjas_horario b on b.dia_semana = a.dia_semana
    join public.servicios_cita sb on sb.id = b.servicio_id and sb.activo and sb.agenda = 'ESPECIALISTAS_SOS'
    where a.hora_inicio < b.hora_fin and b.hora_inicio < a.hora_fin
  );
$$;

create function private.exigir_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce((select private.es_admin()), false) then
    raise exception 'no_autorizado';
  end if;
end;
$$;

create function public.guardar_servicio(p_id smallint, p_datos jsonb)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare v_id smallint;
begin
  perform private.exigir_admin();
  if p_id is null then
    insert into public.servicios_cita (codigo, nombre, duracion_min, eps)
    values (p_datos->>'codigo', p_datos->>'nombre', (p_datos->>'duracion_min')::smallint, p_datos->>'eps')
    returning id into v_id;
  else
    v_id := p_id;
  end if;
  update public.servicios_cita set
    nombre = p_datos->>'nombre',
    nombre_visoft = nullif(trim(p_datos->>'nombre_visoft'), ''),
    duracion_min = (p_datos->>'duracion_min')::smallint,
    eps = p_datos->>'eps',
    menu = coalesce(p_datos->>'menu', 'PRINCIPAL'),
    por_grupo_edad = coalesce((p_datos->>'por_grupo_edad')::boolean, false),
    edad_minima = nullif(p_datos->>'edad_minima', '')::smallint,
    agenda = nullif(p_datos->>'agenda', ''),
    autorizacion_salud_total = coalesce(p_datos->>'autorizacion_salud_total', 'NO'),
    autorizacion_sos = coalesce(p_datos->>'autorizacion_sos', 'NO'),
    ubicacion = nullif(trim(p_datos->>'ubicacion'), ''),
    profesional = nullif(trim(p_datos->>'profesional'), ''),
    notas_equipo = nullif(trim(p_datos->>'notas_equipo'), ''),
    orden = coalesce((p_datos->>'orden')::smallint, 0),
    activo = coalesce((p_datos->>'activo')::boolean, true),
    actualizado_en = now()
  where id = v_id;
  if not found then raise exception 'no_encontrado'; end if;

  -- Si cambió el modo por grupo de edad, las franjas del otro modo ya no aplican.
  delete from public.franjas_horario f
  using public.servicios_cita s
  where s.id = v_id and f.servicio_id = v_id
    and ((s.por_grupo_edad and f.grupo_edad = 'TODOS') or (not s.por_grupo_edad and f.grupo_edad <> 'TODOS'));

  if (select private.hay_cruce_agenda_sos()) then raise exception 'cruce_agenda_sos'; end if;
  perform private.auditar('GESTION_AGENDAS', 'servicio ' || v_id);
  return v_id;
end;
$$;

create function public.guardar_franjas(p_servicio smallint, p_grupo_edad text, p_franjas jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_por_grupo boolean;
  v_duracion smallint;
  v_total integer;
begin
  perform private.exigir_admin();
  select por_grupo_edad, duracion_min into v_por_grupo, v_duracion from public.servicios_cita where id = p_servicio;
  if not found then raise exception 'no_encontrado'; end if;
  if (v_por_grupo and p_grupo_edad not in ('NINOS', 'ADULTOS')) or (not v_por_grupo and p_grupo_edad <> 'TODOS') then
    raise exception 'grupo_edad_invalido';
  end if;
  if jsonb_typeof(p_franjas) <> 'array' or jsonb_array_length(p_franjas) > 60 then
    raise exception 'franjas_invalidas';
  end if;

  delete from public.franjas_horario where servicio_id = p_servicio and grupo_edad = p_grupo_edad;
  insert into public.franjas_horario (servicio_id, grupo_edad, dia_semana, hora_inicio, hora_fin)
  select p_servicio, p_grupo_edad, f.dia, f.inicio, f.fin
  from jsonb_to_recordset(p_franjas) as f(dia smallint, inicio time, fin time);
  get diagnostics v_total = row_count;

  if exists (
    select 1 from public.franjas_horario
    where servicio_id = p_servicio and grupo_edad = p_grupo_edad
      and hora_fin - hora_inicio < make_interval(mins => v_duracion)
  ) then
    raise exception 'franja_muy_corta';
  end if;
  if exists (
    select 1
    from public.franjas_horario a
    join public.franjas_horario b on b.servicio_id = a.servicio_id and b.grupo_edad = a.grupo_edad
      and b.dia_semana = a.dia_semana and b.id > a.id
    where a.servicio_id = p_servicio and a.grupo_edad = p_grupo_edad
      and a.hora_inicio < b.hora_fin and b.hora_inicio < a.hora_fin
  ) then
    raise exception 'franjas_cruzadas';
  end if;
  if (select private.hay_cruce_agenda_sos()) then raise exception 'cruce_agenda_sos'; end if;

  perform private.auditar('GESTION_AGENDAS', 'franjas ' || p_servicio || ' ' || p_grupo_edad);
  return v_total;
end;
$$;

create function public.guardar_config_agenda(p_edad_corte smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_admin();
  update public.configuracion_agenda set edad_corte_ninos = p_edad_corte, actualizado_en = now() where id = 1;
  perform private.auditar('GESTION_AGENDAS', 'edad corte ' || p_edad_corte);
end;
$$;

create function public.guardar_ips_sos(p_id smallint, p_datos jsonb)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare v_id smallint;
begin
  perform private.exigir_admin();
  if p_id is null then
    insert into public.ips_sos (nombre) values (trim(p_datos->>'nombre')) returning id into v_id;
  else
    v_id := p_id;
  end if;
  update public.ips_sos set
    nombre = trim(p_datos->>'nombre'),
    es_primaria = coalesce((p_datos->>'es_primaria')::boolean, false),
    requiere_ops = coalesce((p_datos->>'requiere_ops')::boolean, false),
    nota = nullif(trim(p_datos->>'nota'), ''),
    orden = coalesce((p_datos->>'orden')::smallint, 0),
    activo = coalesce((p_datos->>'activo')::boolean, true)
  where id = v_id;
  if not found then raise exception 'no_encontrado'; end if;
  perform private.auditar('GESTION_AGENDAS', 'ips ' || v_id);
  return v_id;
end;
$$;

create function public.guardar_lineamiento(p_id smallint, p_datos jsonb)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare v_id smallint;
begin
  perform private.exigir_admin();
  if p_id is null then
    insert into public.lineamientos_generales (titulo, texto)
    values (trim(p_datos->>'titulo'), trim(p_datos->>'texto')) returning id into v_id;
  else
    v_id := p_id;
  end if;
  update public.lineamientos_generales set
    titulo = trim(p_datos->>'titulo'),
    texto = trim(p_datos->>'texto'),
    aplica_eps = coalesce(p_datos->>'aplica_eps', 'TODAS'),
    solo_menores = coalesce((p_datos->>'solo_menores')::boolean, false),
    orden = coalesce((p_datos->>'orden')::smallint, 0),
    activo = coalesce((p_datos->>'activo')::boolean, true)
  where id = v_id;
  if not found then raise exception 'no_encontrado'; end if;
  perform private.auditar('GESTION_AGENDAS', 'lineamiento ' || v_id);
  return v_id;
end;
$$;

create function public.eliminar_registro_agenda(p_tabla text, p_id smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_admin();
  if p_tabla = 'ips_sos' then
    delete from public.ips_sos where id = p_id;
  elsif p_tabla = 'lineamientos_generales' then
    delete from public.lineamientos_generales where id = p_id;
  else
    raise exception 'tabla_invalida';
  end if;
  perform private.auditar('GESTION_AGENDAS', 'eliminar ' || p_tabla || ' ' || p_id);
end;
$$;

revoke all on function private.hay_cruce_agenda_sos() from public, anon, authenticated;
revoke all on function private.exigir_admin() from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'public.guardar_servicio(smallint, jsonb)', 'public.guardar_franjas(smallint, text, jsonb)',
    'public.guardar_config_agenda(smallint)', 'public.guardar_ips_sos(smallint, jsonb)',
    'public.guardar_lineamiento(smallint, jsonb)', 'public.eliminar_registro_agenda(text, smallint)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ===================== Datos iniciales (editables en el panel) =====================

insert into public.servicios_cita
  (codigo, nombre, nombre_visoft, duracion_min, eps, menu, por_grupo_edad, edad_minima, agenda,
   autorizacion_salud_total, autorizacion_sos, ubicacion, profesional, notas_equipo, orden)
values
  ('VAL_FISIO_ST', 'Valoración de fisioterapia', null, 15, 'SALUD_TOTAL', 'PRINCIPAL', false, null, null,
   'NO', 'NO', 'Primer piso · valoraciones en las casitas', 'Profesional de fisioterapia de Salud Total', null, 10),
  ('TF_ST', 'Terapia física', null, 45, 'SALUD_TOTAL', 'PRINCIPAL', false, null, null,
   'NO', 'NO', 'Primer piso', 'Profesional de fisioterapia de Salud Total', null, 20),
  ('VAL_FISIO_SOS', 'Valoración de fisioterapia (OPS de terapia física integral)', null, 15, 'SOS', 'PRINCIPAL', false, null, 'FISIO_SOS',
   'NO', 'SIEMPRE', 'Primer piso · valoraciones en las casitas', 'Fisioterapia SOS (UPI)',
   'La OPS dice «terapia física integral»: se asigna valoración y luego pasa a terapias. Antes del último turno de terapia física; no martes, ni miércoles y jueves en la tarde.', 10),
  ('TF_SOS', 'Terapia física (continuidad)', null, 45, 'SOS', 'PRINCIPAL', false, null, 'FISIO_SOS',
   'NO', 'CONDICIONAL', 'Primer piso', 'Fisioterapia SOS (UPI)',
   'Solo fuera de los horarios de especialistas. Más de un mes sin asistir: valoración en la UPI.', 20),
  ('FISIATRIA', 'Fisiatría', 'Consulta de primera vez con Medicina Física y Rehabilitación', 15, 'SOS', 'ESPECIALISTAS', false, 16, 'ESPECIALISTAS_SOS',
   'NO', 'SIEMPRE', 'Primer piso', 'Nancy Argote (pacientes en tratamiento previo con orden de Promover)',
   'Reemplazo de articulaciones, obesidad, cambio de prótesis, sillas de ruedas, reducción mamaria, entre otros.', 30),
  ('ORTOPEDIA', 'Ortopedia (UPI osteomuscular)', 'Consulta de primera vez fisioterapia', 15, 'SOS', 'ESPECIALISTAS', false, 16, 'ESPECIALISTAS_SOS',
   'NO', 'SIEMPRE', 'Primer piso', 'Equipo UPI', 'Citas de control o valoración por ortopedia.', 31),
  ('INTERDISCIPLINARIO', 'Equipo interdisciplinario', 'Consulta de primera vez fisioterapia', 15, 'SOS', 'ESPECIALISTAS', false, 16, 'ESPECIALISTAS_SOS',
   'NO', 'SIEMPRE', 'Primer piso', 'Ortopedia, fisiatría y fisioterapia', 'Solo en el horario de ortopedia y cuando haya ortopedia.', 32),
  ('INFILTRACIONES', 'Infiltraciones', 'Control y seguimiento – Medicina Física y Rehabilitación con Argote', 15, 'SOS', 'ESPECIALISTAS', false, 16, null,
   'NO', 'SIEMPRE', 'Primer piso', 'Nancy Argote', null, 33),
  ('VAL_FONO', 'Valoración de fonoaudiología', null, 15, 'TODAS', 'PRINCIPAL', true, null, null,
   'SIEMPRE', 'SIEMPRE', 'Segundo piso · valoraciones en las casitas; tratamientos en silla o camilla', 'Adriana Lucía Cabezas',
   'Agendar niños con niños y adultos con adultos.', 40),
  ('VAL_OCUPACIONAL', 'Valoración de terapia ocupacional', null, 15, 'TODAS', 'PRINCIPAL', true, null, null,
   'SIEMPRE', 'CONDICIONAL', 'Segundo piso · valoraciones en las casitas; tratamientos en silla o camilla', 'Paola Flor',
   'SOS: menores siempre con OPS; adultos de IPS primarias sin autorización; diagnóstico neurológico (Down, ACV, condiciones psicológicas, alteraciones de la marcha…) con OPS. Agendar niños con niños y adultos con adultos.', 50),
  ('VAL_RESPIRATORIA', 'Valoración de terapia respiratoria', null, 30, 'TODAS', 'PRINCIPAL', false, null, null,
   'NO', 'NO', 'Primer piso', null, 'Turnos 11:00, 11:20 y 11:40.', 60),
  ('T_RESPIRATORIA', 'Terapia respiratoria', null, 20, 'TODAS', 'PRINCIPAL', false, null, null,
   'NO', 'NO', 'Primer piso', null, 'Turnos 11:00, 11:20 y 11:40.', 70);

-- Franjas: (código, grupo, días, inicio, fin). Jornada 7:00–12:15 y 13:15–17:00.
insert into public.franjas_horario (servicio_id, grupo_edad, dia_semana, hora_inicio, hora_fin)
select s.id, x.grupo, d, x.inicio::time, x.fin::time
from (values
  ('VAL_FISIO_ST', 'TODOS', '{1,2,3,4,5}', '07:00', '12:15'), ('VAL_FISIO_ST', 'TODOS', '{1,2,3,4,5}', '13:15', '17:00'),
  ('TF_ST', 'TODOS', '{1,2,3,4,5}', '07:00', '12:15'), ('TF_ST', 'TODOS', '{1,2,3,4,5}', '13:15', '17:00'),
  ('VAL_FISIO_SOS', 'TODOS', '{1,3,4,5}', '07:00', '11:30'), ('VAL_FISIO_SOS', 'TODOS', '{1,5}', '13:15', '16:15'),
  ('TF_SOS', 'TODOS', '{1,3,4,5}', '07:00', '12:15'), ('TF_SOS', 'TODOS', '{1,2,3,5}', '13:15', '17:00'),
  ('FISIATRIA', 'TODOS', '{2}', '07:00', '12:15'), ('FISIATRIA', 'TODOS', '{4}', '13:15', '17:00'),
  ('ORTOPEDIA', 'TODOS', '{2}', '07:00', '12:15'), ('ORTOPEDIA', 'TODOS', '{4}', '13:15', '17:00'),
  ('INTERDISCIPLINARIO', 'TODOS', '{2}', '07:00', '12:15'), ('INTERDISCIPLINARIO', 'TODOS', '{4}', '13:15', '17:00'),
  ('INFILTRACIONES', 'TODOS', '{4}', '07:00', '12:15'),
  ('VAL_FONO', 'NINOS', '{1,2,3,4,5}', '07:00', '08:45'), ('VAL_FONO', 'NINOS', '{1,2,3,4,5}', '13:15', '13:45'),
  ('VAL_FONO', 'ADULTOS', '{1,2,3,4,5}', '07:00', '08:45'), ('VAL_FONO', 'ADULTOS', '{1,2,3,4,5}', '13:15', '13:45'),
  ('VAL_OCUPACIONAL', 'NINOS', '{1,2,3,4,5}', '07:00', '08:45'), ('VAL_OCUPACIONAL', 'NINOS', '{1,2,3,4,5}', '13:15', '13:45'),
  ('VAL_OCUPACIONAL', 'ADULTOS', '{1,2,3,4,5}', '07:00', '08:45'), ('VAL_OCUPACIONAL', 'ADULTOS', '{1,2,3,4,5}', '13:15', '13:45'),
  ('VAL_RESPIRATORIA', 'TODOS', '{1,2,3,4,5}', '11:00', '12:10'),
  ('T_RESPIRATORIA', 'TODOS', '{1,2,3,4,5}', '11:00', '12:00')
) as x(codigo, grupo, dias, inicio, fin)
join public.servicios_cita s on s.codigo = x.codigo
cross join lateral unnest(x.dias::smallint[]) as d;

insert into public.ips_sos (nombre, es_primaria, requiere_ops, nota, orden) values
  ('Morichal', true, false, null, 1),
  ('Tequendama', true, false, null, 2),
  ('Alameda', true, false, null, 3),
  ('Unión Viva', true, false, null, 4),
  ('Ladera', true, false, null, 5),
  ('Comfandi Prado', false, true, 'Debe presentar OPS.', 10),
  ('Comfandi Torres', false, true, 'Debe presentar OPS.', 11),
  ('Santander de Quilichao', false, true, 'Solo se atiende para especialistas y con OPS.', 12),
  ('Puerto Tejada', false, true, 'Solo se atiende para especialistas y con OPS.', 13),
  ('Viva Jamundí', false, false, 'Acceso directo para consulta de fisioterapia o especialistas; para tratamiento requiere OPS.', 14);

insert into public.lineamientos_generales (titulo, texto, aplica_eps, solo_menores, orden) values
  ('Protección Laboral', 'No se agendan pacientes cuyo estado de afiliación sea Protección Laboral.', 'TODAS', false, 1),
  ('Vencimiento de la OPS', 'Verificar cuidadosamente la fecha de vencimiento de la OPS.', 'SOS', false, 2),
  ('Continuidad de terapias', 'Máximo 15 a 20 días para ingresar a sala y continuar. Pasado ese tiempo: nueva orden y consulta. Con un mes o menos ingresa como control y seguimiento; con más de un mes, valoración desde cero. Aplica a fonoaudiología, ocupacional, respiratoria y física.', 'SALUD_TOTAL', false, 3),
  ('Continuidad de terapias', 'Según el tiempo puede ingresar a sala como valoración de triage. Más de un mes sin asistir: valoración en la UPI. No requiere nueva orden si no han pasado más de 6 meses sin asistir; el médico general define la continuidad.', 'SOS', false, 4),
  ('Apertura de admisión', 'A principio de cada mes se asigna una sola cita para apertura de admisión. Excepciones: OPS, Plan Senior, Plan Privilegio, Plan Bienestar, Plan Familiar, Particular y SOAT.', 'TODAS', false, 5),
  ('Datos del acudiente', 'Para facturar copago o cuota moderadora de un menor de edad, solicitar los datos completos del acudiente o responsable.', 'TODAS', true, 6),
  ('Menores de 16 años', 'No se atienden con especialistas, aunque cuenten con OPS.', 'TODAS', true, 7);
