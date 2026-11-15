-- Auditoría de permisos (solo lectura). Cada fila es un hallazgo; lo esperado está en el README de seguridad.
select 'tabla_sin_rls' as hallazgo, tablename::text as objeto, '' as detalle
from pg_tables where schemaname = 'public' and not rowsecurity
union all
select 'privilegio_anon', table_name::text, string_agg(privilege_type, ',')
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon' group by table_name
union all
select 'privilegio_authenticated', table_name::text, string_agg(privilege_type, ',' order by privilege_type)
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'authenticated' group by table_name
union all
select 'funcion_ejecutable_por_' || r.rolname, p.oid::regprocedure::text,
       case when p.prosecdef then 'SECURITY DEFINER' else 'invoker' end
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname in ('public', 'private')
cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
where has_function_privilege(r.rolname, p.oid, 'execute')
union all
select 'funcion_sin_search_path', p.oid::regprocedure::text, ''
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname in ('public', 'private')
where not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
union all
select 'vista_sin_security_invoker', c.relname::text, ''
from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relkind = 'v' and not coalesce(c.reloptions::text like '%security_invoker=true%', false)
union all
select 'politica', tablename || '.' || policyname, cmd || ' -> ' || array_to_string(roles, ',')
from pg_policies where schemaname = 'public'
order by 1, 2;
