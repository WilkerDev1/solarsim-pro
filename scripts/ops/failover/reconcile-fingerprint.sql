-- Huella de cada fila de cada tabla (solo lectura): tabla|clave primaria|md5 de la fila.
-- Sirve para detectar lo que ninguna marca de tiempo captura: filas BORRADAS (organization_memberships,
-- equipment_catalog, projects usan DELETE) y cambios en cualquier tabla. Ejecutar en ambas bases y comparar:
--   psql -At -f reconcile-fingerprint.sql > fp-volumen.txt     (volumen de naski)
--   psql -At -f reconcile-fingerprint.sql > fp-ct100.txt       (CT100)
--   diff fp-ct100.txt fp-volumen.txt
-- "<" = solo en CT100 o distinta (p. ej. membresia borrada en naski); ">" = solo en naski o distinta (alta o edicion).
-- Una migracion nueva cambia filas en masa: esas diferencias no son cambios de usuarios.
select string_agg(
         format('select %L as t, %s as k, md5(x::text) as h from %I x', c.relname, coalesce(pk.expr, 'md5(x::text)'), c.relname),
         ' union all ' order by c.relname) as q
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join lateral (
  select string_agg(format('x.%I::text', a.attname), ' || ''|'' || ' order by array_position(i.indkey::int2[], a.attnum)) as expr
  from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey::int2[])
  where i.indrelid = c.oid and i.indisprimary) pk on true
where c.relkind = 'r' \gset
select t || '|' || k || '|' || h from (:q) s order by t, k;
