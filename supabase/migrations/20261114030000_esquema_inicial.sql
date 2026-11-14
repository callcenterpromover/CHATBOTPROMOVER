-- PROMOVER chatbot piloto — esquema inicial (v0.4)
-- Solo campos operativos mínimos de solicitudes ACTIVAS. Sin imágenes, sin texto OCR completo, sin chat.
-- Al cerrar una solicitud se borra todo lo identificable (ver public.cerrar_solicitud).

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Operadores (lista blanca de usuarios del panel)
-- ---------------------------------------------------------------------------
create table public.operadores (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

-- En esquema no expuesto: no es invocable por la API, solo desde las políticas.
create function private.es_operador()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.operadores o
    where o.user_id = (select auth.uid()) and o.activo
  );
$$;

-- ---------------------------------------------------------------------------
-- Solicitudes activas
-- ---------------------------------------------------------------------------
create table public.solicitudes (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  creada_en timestamptz not null default now(),          -- inicio del contador de espera (RB-067)
  ultima_interaccion timestamptz not null default now(),
  telefono text,
  nombre text,
  documento text check (documento ~ '^[0-9A-Za-z]{4,20}$'),
  eps text not null default 'SIN_DEFINIR'
    check (eps in ('SALUD_TOTAL', 'SOS', 'OTRA', 'SIN_DEFINIR')),
  eps_texto text,
  servicio_texto text,                                    -- texto literal de la orden / paciente
  categoria_probable text not null default 'SIN_CLASIFICAR'
    check (categoria_probable in (
      'FISIOTERAPIA', 'FONOAUDIOLOGIA', 'TERAPIA_OCUPACIONAL', 'TERAPIA_RESPIRATORIA',
      'FISIATRIA', 'ORTOPEDIA', 'EQUIPO_INTERDISCIPLINARIO', 'INFILTRACIONES',
      'FUERA_DE_ALCANCE', 'SIN_CLASIFICAR')),
  clasificacion_motivo text,
  clasificacion_confianza text check (clasificacion_confianza in ('ALTA', 'MEDIA', 'BAJA')),
  estado text not null default 'NUEVA'
    check (estado in (
      'NUEVA', 'ESPERANDO_DATOS', 'ESPERANDO_ORDEN', 'ESPERANDO_HISTORIA', 'ESPERANDO_PLAN',
      'DOCUMENTOS_POR_REENVIAR', 'PENDIENTE_VERIFICACION_HUMANA', 'LISTA_PARA_REVISION')),
  orden_estado text not null default 'NO_RECIBIDA'
    check (orden_estado in (
      'NO_RECIBIDA', 'RECIBIDA_PENDIENTE_REVISION', 'ILEGIBLE', 'LEGIBLE', 'CONFIRMADA_HUMANAMENTE')),
  historia_estado text not null default 'NO_RECIBIDA'
    check (historia_estado in (
      'NO_RECIBIDA', 'RECIBIDA_PENDIENTE_REVISION', 'POSIBLEMENTE_INCOMPLETA', 'ILEGIBLE',
      'COMPLETITUD_CONFIRMADA_HUMANAMENTE')),
  plan_estado text not null default 'NO_REQUERIDO'
    check (plan_estado in ('NO_REQUERIDO', 'REQUERIDO_PENDIENTE', 'RECIBIDO')),
  autorizacion_estado text not null default 'NO_DETERMINADA'
    check (autorizacion_estado in (
      'NO_DETERMINADA', 'NO_RECIBIDA', 'RECIBIDA', 'PENDIENTE_VERIFICACION_HUMANA',
      'POSIBLEMENTE_UTILIZADA')),
  orden_vencimiento date,
  orden_vencimiento_texto text,
  orden_vencimiento_confianza text check (orden_vencimiento_confianza in ('ALTA', 'MEDIA', 'BAJA')),
  terapia_previa text check (terapia_previa in ('SI', 'NO', 'NO_SABE')),
  preferencia_horario text,
  edad integer check (edad between 0 and 120),
  factores text[] not null default '{}'
    check (factores <@ array['FUERA_DE_CALI', 'MOVILIDAD_REDUCIDA', 'ADULTO_MAYOR', 'EMBARAZO']),
  factores_origen text check (factores_origen in ('DECLARADO', 'DOCUMENTADO')),
  revision_humana text not null default 'PENDIENTE'
    check (revision_humana in ('PENDIENTE', 'COMPLETADA')),
  cita_previa_fecha date                                  -- registrada manualmente (RB-067)
);

create index solicitudes_creada_en_idx on public.solicitudes (creada_en);
create index solicitudes_documento_idx on public.solicitudes (documento);
create index solicitudes_vencimiento_idx on public.solicitudes (orden_vencimiento)
  where orden_vencimiento is not null;

-- ---------------------------------------------------------------------------
-- Campos extraídos por OCR (solo el valor del campo, nunca el texto completo)
-- ---------------------------------------------------------------------------
create table public.campos_extraidos (
  id bigint generated always as identity primary key,
  solicitud_id uuid not null references public.solicitudes (id) on delete cascade,
  campo text not null
    check (campo in (
      'DOCUMENTO', 'NOMBRE', 'EPS', 'SERVICIO', 'DIAGNOSTICO', 'FECHA_EMISION',
      'FECHA_VENCIMIENTO', 'NUMERO_ORDEN')),
  origen text not null check (origen in ('ORDEN', 'HISTORIA', 'PLAN', 'AUTORIZACION')),
  valor_ocr text,                                         -- lo que leyó el OCR (no se sobrescribe)
  valor_corregido text,                                   -- corrección humana, separada
  confianza text check (confianza in ('ALTA', 'MEDIA', 'BAJA')),
  verificacion text not null default 'SIN_COMPARAR'
    check (verificacion in ('SIN_COMPARAR', 'COINCIDE', 'DISCREPANCIA', 'CORREGIDO_HUMANO')),
  creado_en timestamptz not null default now()
);
create index campos_extraidos_solicitud_idx on public.campos_extraidos (solicitud_id);

-- ---------------------------------------------------------------------------
-- Alertas automáticas (RB-065: qué se detectó, por qué, qué revisar)
-- ---------------------------------------------------------------------------
create table public.alertas (
  id bigint generated always as identity primary key,
  solicitud_id uuid not null references public.solicitudes (id) on delete cascade,
  codigo text not null,
  detalle text not null,
  resuelta boolean not null default false,
  creada_en timestamptz not null default now()
);
create index alertas_solicitud_idx on public.alertas (solicitud_id);

-- ---------------------------------------------------------------------------
-- Observaciones del operador (breves; no copiar contenido clínico)
-- ---------------------------------------------------------------------------
create table public.observaciones (
  id bigint generated always as identity primary key,
  solicitud_id uuid not null references public.solicitudes (id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 500),
  autor uuid not null default auth.uid() references auth.users (id),
  creada_en timestamptz not null default now()
);
create index observaciones_solicitud_idx on public.observaciones (solicitud_id);
create index observaciones_autor_idx on public.observaciones (autor);

-- ---------------------------------------------------------------------------
-- Cola de trabajos OCR (el worker local la consume; solo guarda el media_id de Meta)
-- ---------------------------------------------------------------------------
create table public.trabajos_ocr (
  id bigint generated always as identity primary key,
  solicitud_id uuid not null references public.solicitudes (id) on delete cascade,
  media_id text not null,
  tipo_documento text not null default 'DESCONOCIDO'
    check (tipo_documento in ('ORDEN', 'HISTORIA', 'PLAN', 'AUTORIZACION', 'DESCONOCIDO')),
  estado text not null default 'PENDIENTE'
    check (estado in ('PENDIENTE', 'EN_PROCESO', 'COMPLETADO', 'ERROR', 'REENVIO_REQUERIDO')),
  intentos integer not null default 0,
  legibilidad text check (legibilidad in ('LEGIBLE', 'POSIBLEMENTE_ILEGIBLE', 'ILEGIBLE')),
  pagina_actual integer,
  pagina_total integer,
  error_codigo text,                                      -- código técnico, sin datos del paciente
  creado_en timestamptz not null default now(),
  iniciado_en timestamptz,
  terminado_en timestamptz
);
create index trabajos_ocr_solicitud_idx on public.trabajos_ocr (solicitud_id);
create index trabajos_ocr_pendientes_idx on public.trabajos_ocr (creado_en) where estado = 'PENDIENTE';

-- ---------------------------------------------------------------------------
-- Historial de estados (se borra junto con la solicitud)
-- ---------------------------------------------------------------------------
create table public.historial_estados (
  id bigint generated always as identity primary key,
  solicitud_id uuid not null references public.solicitudes (id) on delete cascade,
  estado_anterior text,
  estado_nuevo text not null,
  cambiado_por uuid,
  cambiado_en timestamptz not null default now()
);
create index historial_estados_solicitud_idx on public.historial_estados (solicitud_id);

create function private.registrar_cambio_estado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado is distinct from old.estado then
    insert into public.historial_estados (solicitud_id, estado_anterior, estado_nuevo, cambiado_por)
    values (new.id, old.estado, new.estado, (select auth.uid()));
  end if;
  return new;
end;
$$;

create trigger solicitudes_cambio_estado
after update of estado on public.solicitudes
for each row execute function private.registrar_cambio_estado();

-- ---------------------------------------------------------------------------
-- Métricas agregadas de cierre (no reidentificables: sin IDs ni datos del paciente)
-- ---------------------------------------------------------------------------
create table public.metricas_cierre (
  mes date not null,
  eps text not null,
  categoria text not null,
  motivo text not null,
  total integer not null default 0,
  suma_dias_espera integer not null default 0,
  primary key (mes, eps, categoria, motivo)
);

create function private.registrar_cierre()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := coalesce(nullif(current_setting('app.motivo_cierre', true), ''), 'SIN_MOTIVO');
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_dias integer := v_hoy - (old.creada_en at time zone 'America/Bogota')::date;
begin
  insert into public.metricas_cierre (mes, eps, categoria, motivo, total, suma_dias_espera)
  values (date_trunc('month', v_hoy)::date, old.eps, old.categoria_probable, v_motivo, 1, v_dias)
  on conflict (mes, eps, categoria, motivo)
  do update set total = public.metricas_cierre.total + 1,
                suma_dias_espera = public.metricas_cierre.suma_dias_espera + excluded.suma_dias_espera;
  return old;
end;
$$;

create trigger solicitudes_registrar_cierre
before delete on public.solicitudes
for each row execute function private.registrar_cierre();

-- ---------------------------------------------------------------------------
-- Cierre con borrado verificado (acción GESTIONADA del panel)
-- ---------------------------------------------------------------------------
create function public.cerrar_solicitud(p_id uuid, p_motivo text default 'GESTIONADA')
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_borradas integer;
  v_restos integer;
begin
  if p_motivo not in ('GESTIONADA', 'CERRADA_DUPLICADA', 'CERRADA_POR_USUARIO') then
    raise exception 'motivo_invalido';
  end if;

  perform set_config('app.motivo_cierre', p_motivo, true);

  delete from public.solicitudes where id = p_id;
  get diagnostics v_borradas = row_count;
  if v_borradas = 0 then
    raise exception 'solicitud_no_encontrada';
  end if;

  -- Verificación: no debe quedar nada vinculado a este ID. Si queda, se revierte todo.
  select
      (select count(*) from public.solicitudes where id = p_id)
    + (select count(*) from public.campos_extraidos where solicitud_id = p_id)
    + (select count(*) from public.alertas where solicitud_id = p_id)
    + (select count(*) from public.observaciones where solicitud_id = p_id)
    + (select count(*) from public.trabajos_ocr where solicitud_id = p_id)
    + (select count(*) from public.historial_estados where solicitud_id = p_id)
  into v_restos;

  if v_restos > 0 then
    raise exception 'eliminacion_incompleta';
  end if;

  return jsonb_build_object('eliminada', true, 'motivo', p_motivo);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cola: reclamar el siguiente trabajo (solo el worker, con service_role)
-- ---------------------------------------------------------------------------
create function public.reclamar_trabajo_ocr()
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
    order by creado_en
    limit 1
    for update skip locked
  )
  returning *;
$$;

-- ---------------------------------------------------------------------------
-- Vista de lista de espera (respeta RLS del usuario que consulta)
-- ---------------------------------------------------------------------------
create view public.lista_espera
with (security_invoker = true)
as
select
  s.*,
  (now() at time zone 'America/Bogota')::date - (s.creada_en at time zone 'America/Bogota')::date
    as dias_espera,
  case when s.orden_vencimiento is not null
    then s.orden_vencimiento - (now() at time zone 'America/Bogota')::date
  end as dias_para_vencer,
  coalesce(a.abiertas, 0) as alertas_abiertas,
  coalesce(c.discrepancias, 0) as discrepancias,
  case when s.documento is not null
    then count(*) over (partition by s.documento)
    else 1
  end as solicitudes_mismo_documento,
  case
    when coalesce(c.discrepancias, 0) > 0 then 'DISCREPANCIA'
    when s.historia_estado = 'POSIBLEMENTE_INCOMPLETA' then 'POSIBLEMENTE_INCOMPLETA'
    when s.orden_estado in ('LEGIBLE', 'CONFIRMADA_HUMANAMENTE')
     and s.historia_estado in ('RECIBIDA_PENDIENTE_REVISION', 'COMPLETITUD_CONFIRMADA_HUMANAMENTE')
     and s.plan_estado <> 'REQUERIDO_PENDIENTE' then 'COMPLETO'
    else 'INCOMPLETO'
  end as estado_documental
from public.solicitudes s
left join lateral (
  select count(*) as abiertas from public.alertas al
  where al.solicitud_id = s.id and not al.resuelta
) a on true
left join lateral (
  select count(*) as discrepancias from public.campos_extraidos ce
  where ce.solicitud_id = s.id and ce.verificacion = 'DISCREPANCIA'
) c on true;

-- ---------------------------------------------------------------------------
-- Privilegios: mínimo necesario. anon no accede a nada.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.es_operador() to authenticated;

grant select on public.operadores to authenticated;
grant select, update, delete on public.solicitudes to authenticated;
grant select, update (valor_corregido, verificacion) on public.campos_extraidos to authenticated;
grant select, update (resuelta) on public.alertas to authenticated;
grant select, insert (solicitud_id, texto), delete on public.observaciones to authenticated;
grant select on public.trabajos_ocr to authenticated;
grant select on public.historial_estados to authenticated;
grant select on public.metricas_cierre to authenticated;
grant select on public.lista_espera to authenticated;
grant execute on function public.cerrar_solicitud(uuid, text) to authenticated;

grant execute on function public.reclamar_trabajo_ocr() to service_role;
grant execute on function public.cerrar_solicitud(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- RLS: solo operadores activos
-- ---------------------------------------------------------------------------
alter table public.operadores enable row level security;
alter table public.solicitudes enable row level security;
alter table public.campos_extraidos enable row level security;
alter table public.alertas enable row level security;
alter table public.observaciones enable row level security;
alter table public.trabajos_ocr enable row level security;
alter table public.historial_estados enable row level security;
alter table public.metricas_cierre enable row level security;

create policy operadores_ver_propio on public.operadores
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy solicitudes_ver on public.solicitudes
  for select to authenticated using ((select private.es_operador()));
create policy solicitudes_editar on public.solicitudes
  for update to authenticated
  using ((select private.es_operador())) with check ((select private.es_operador()));
create policy solicitudes_borrar on public.solicitudes
  for delete to authenticated using ((select private.es_operador()));

create policy campos_ver on public.campos_extraidos
  for select to authenticated using ((select private.es_operador()));
create policy campos_editar on public.campos_extraidos
  for update to authenticated
  using ((select private.es_operador())) with check ((select private.es_operador()));

create policy alertas_ver on public.alertas
  for select to authenticated using ((select private.es_operador()));
create policy alertas_editar on public.alertas
  for update to authenticated
  using ((select private.es_operador())) with check ((select private.es_operador()));

create policy observaciones_ver on public.observaciones
  for select to authenticated using ((select private.es_operador()));
create policy observaciones_crear on public.observaciones
  for insert to authenticated
  with check ((select private.es_operador()) and autor = (select auth.uid()));
create policy observaciones_borrar on public.observaciones
  for delete to authenticated using ((select private.es_operador()));

create policy trabajos_ver on public.trabajos_ocr
  for select to authenticated using ((select private.es_operador()));

create policy historial_ver on public.historial_estados
  for select to authenticated using ((select private.es_operador()));

create policy metricas_ver on public.metricas_cierre
  for select to authenticated using ((select private.es_operador()));
