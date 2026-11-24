-- Flujo del bot por tipo de solicitud (docs/superpowers/specs/2026-11-24-flujo-conversacion-bot.md).
-- Decisiones de PROMOVER (2026-11-24):
--   * Terapias (continuidad, cualquier EPS): solo plan de tratamiento + fecha de última asistencia;
--     más de 20 días sin asistir → renovar el proceso con medicina general de la EPS.
--   * OPS de SOS: fonoaudiología siempre; ocupacional y especialistas: menores siempre y adultos según
--     diagnóstico/IPS (CONDICIONAL); la valoración y la terapia física no la exigen.

-- 1) Fecha de la última asistencia a terapia, declarada por el paciente (editable en el panel).
alter table public.solicitudes add column if not exists ultima_asistencia date;
comment on column public.solicitudes.ultima_asistencia is
  'Última asistencia a terapia declarada por el paciente (continuidad). No confundir con cita_previa_fecha.';
grant update (ultima_asistencia) on public.solicitudes to authenticated;

-- 2) Requisito de OPS en SOS según lo decidido (siguen editables en el panel Agendas).
update public.servicios_cita set autorizacion_sos = 'NO'
  where codigo in ('VAL_FISIO_SOS', 'TF_SOS', 'VAL_RESPIRATORIA', 'T_RESPIRATORIA');
update public.servicios_cita set autorizacion_sos = 'SIEMPRE' where codigo = 'VAL_FONO';
update public.servicios_cita set autorizacion_sos = 'CONDICIONAL'
  where codigo in ('VAL_OCUPACIONAL', 'FISIATRIA', 'ORTOPEDIA', 'INTERDISCIPLINARIO', 'INFILTRACIONES');
update public.servicios_cita set
  notas_equipo = 'OPS: menores siempre; adultos según diagnóstico (Down, ACV, condiciones psicológicas, alteraciones de la marcha…) o IPS primaria.'
  where codigo = 'VAL_OCUPACIONAL';

-- 3) Terapias de continuidad de fonoaudiología y ocupacional (no existían en el menú, así que el
--    paciente que ya está en terapia elegía «valoración»). Mismos horarios y duración que la
--    valoración; el administrador los ajusta en Agendas.
insert into public.servicios_cita
  (codigo, nombre, nombre_visoft, duracion_min, eps, menu, por_grupo_edad, edad_minima, agenda,
   autorizacion_salud_total, autorizacion_sos, ubicacion, profesional, notas_equipo, orden)
select 'T_FONO', 'Terapia de fonoaudiología (continuidad)', null, duracion_min, 'TODAS', 'PRINCIPAL', true,
       null, null, 'NO', 'NO', ubicacion, profesional, 'Continuidad: solo plan de tratamiento y última asistencia.', 45
from public.servicios_cita where codigo = 'VAL_FONO'
on conflict (codigo) do nothing;
insert into public.servicios_cita
  (codigo, nombre, nombre_visoft, duracion_min, eps, menu, por_grupo_edad, edad_minima, agenda,
   autorizacion_salud_total, autorizacion_sos, ubicacion, profesional, notas_equipo, orden)
select 'T_OCUPACIONAL', 'Terapia ocupacional (continuidad)', null, duracion_min, 'TODAS', 'PRINCIPAL', true,
       null, null, 'NO', 'NO', ubicacion, profesional, 'Continuidad: solo plan de tratamiento y última asistencia.', 55
from public.servicios_cita where codigo = 'VAL_OCUPACIONAL'
on conflict (codigo) do nothing;

insert into public.franjas_horario (servicio_id, grupo_edad, dia_semana, hora_inicio, hora_fin)
select nuevo.id, f.grupo_edad, f.dia_semana, f.hora_inicio, f.hora_fin
from public.franjas_horario f
join public.servicios_cita origen on origen.id = f.servicio_id
join public.servicios_cita nuevo on (origen.codigo, nuevo.codigo) in (('VAL_FONO', 'T_FONO'), ('VAL_OCUPACIONAL', 'T_OCUPACIONAL'))
where not exists (select 1 from public.franjas_horario x where x.servicio_id = nuevo.id);

-- 4) «Terapia física (continuidad)» de SOS: la nota hablaba de «más de un mes»; ahora son 20 días.
update public.servicios_cita set
  notas_equipo = 'Solo fuera de los horarios de especialistas. Más de 20 días sin asistir: renovar el proceso con medicina general de la EPS.'
  where codigo = 'TF_SOS';
