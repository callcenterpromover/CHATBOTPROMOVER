-- Bot de WhatsApp: estado de la conversación, idempotencia y simulador.

-- Fecha en que el paciente autorizó el tratamiento de datos (se borra con la solicitud).
alter table public.solicitudes add column consentimiento_en timestamptz;

-- Paso actual de cada conversación. Solo guarda el paso y datos temporales mínimos, nunca el chat.
-- Se borra sola cuando se cierra la solicitud (on delete cascade).
create table public.conversaciones (
  telefono text primary key,
  solicitud_id uuid references public.solicitudes (id) on delete cascade,
  paso text not null,
  datos jsonb not null default '{}'::jsonb,
  actualizado_en timestamptz not null default now()
);
create index conversaciones_solicitud_idx on public.conversaciones (solicitud_id);

-- IDs de mensajes de Meta ya procesados (Meta reintenta los webhooks). Sin contenido.
create table public.mensajes_procesados (
  id text primary key,
  recibido_en timestamptz not null default now()
);

-- Solo para el simulador (Fase 1, datos ficticios). En operación real no se usa.
create table public.mensajes_simulador (
  id bigint generated always as identity primary key,
  telefono text not null,
  direccion text not null check (direccion in ('ENTRANTE', 'SALIENTE')),
  texto text not null,
  creado_en timestamptz not null default now()
);
create index mensajes_simulador_telefono_idx on public.mensajes_simulador (telefono, id);

-- Solo el backend (service_role) accede a estas tablas.
alter table public.conversaciones enable row level security;
alter table public.mensajes_procesados enable row level security;
alter table public.mensajes_simulador enable row level security;
revoke all on public.conversaciones, public.mensajes_procesados, public.mensajes_simulador from anon, authenticated;
grant select, insert, update, delete on public.conversaciones, public.mensajes_procesados, public.mensajes_simulador to service_role;

-- Estado general de una solicitud calculado con los datos actuales. Es la regla única: la usan el
-- bot y el worker (guardar_resultado_ocr). No cambia nada si una persona ya completó la revisión.
create function public.recalcular_estado(p_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.solicitudes;
  v_alertas integer;
  v_estado text;
begin
  select * into s from public.solicitudes where id = p_id for update;
  if not found then
    return null;
  end if;
  if s.revision_humana = 'COMPLETADA' then
    return s.estado;
  end if;

  select count(*) into v_alertas from public.alertas where solicitud_id = p_id and not resuelta;

  v_estado := case
    when 'ILEGIBLE' in (s.orden_estado, s.historia_estado) then 'DOCUMENTOS_POR_REENVIAR'
    when s.nombre is null or s.documento is null or s.eps = 'SIN_DEFINIR' or s.servicio_texto is null
      then 'ESPERANDO_DATOS'
    when s.orden_estado = 'NO_RECIBIDA' then 'ESPERANDO_ORDEN'
    when s.historia_estado = 'NO_RECIBIDA' then 'ESPERANDO_HISTORIA'
    when s.plan_estado = 'REQUERIDO_PENDIENTE' then 'ESPERANDO_PLAN'
    when v_alertas > 0
      or s.historia_estado = 'POSIBLEMENTE_INCOMPLETA'
      or s.autorizacion_estado in ('PENDIENTE_VERIFICACION_HUMANA', 'POSIBLEMENTE_UTILIZADA')
      or s.eps not in ('SALUD_TOTAL', 'SOS')
      or s.categoria_probable in ('SIN_CLASIFICAR', 'FUERA_DE_ALCANCE')
      then 'PENDIENTE_VERIFICACION_HUMANA'
    else 'LISTA_PARA_REVISION'
  end;

  if v_estado is distinct from s.estado then
    update public.solicitudes set estado = v_estado where id = p_id;
  end if;
  return v_estado;
end;
$$;

revoke all on function public.recalcular_estado(uuid) from public, anon, authenticated;
grant execute on function public.recalcular_estado(uuid) to service_role;

-- El worker guarda y, al final, se recalcula el estado con los datos frescos (no con su copia).
create or replace function public.guardar_resultado_ocr(p_trabajo_id bigint, p_resultado jsonb)
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

  insert into public.alertas (solicitud_id, codigo, detalle)
  select v_sol, a ->> 'codigo', a ->> 'detalle'
  from jsonb_array_elements(coalesce(p_resultado -> 'alertas', '[]'::jsonb)) a
  where not exists (
    select 1 from public.alertas x
    where x.solicitud_id = v_sol and x.codigo = a ->> 'codigo' and not x.resuelta
  );

  update public.solicitudes set
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

  perform public.recalcular_estado(v_sol);
  return true;
end;
$$;
