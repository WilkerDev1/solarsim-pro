-- Informe de reconciliacion (solo lectura). Ejecutar contra la base escrita durante la conmutacion (volumen de naski)
-- y contra la del CT100, con el instante del dump como corte:
--   psql -v since='2026-11-05 07:07:14+00' -f reconcile-report.sql
-- Este informe usa marcas de tiempo y NO ve filas borradas con DELETE: complementarlo con reconcile-fingerprint.sql.
-- OJO: una migracion nueva toca updated_at de muchas filas a la vez al arrancar la API; esas filas NO son cambios de usuarios.
\echo === migraciones aplicadas
select version, applied_at from schema_migrations order by version desc limit 3;
\echo === filas creadas, modificadas o borradas desde el corte, por tabla y columna
select string_agg(
         format('select %L as tabla, %L as columna, count(*) as filas from %I where %I > %L::timestamptz having count(*) > 0',
                table_name, column_name, table_name, column_name, :'since'),
         ' union all ' order by table_name, column_name) as q
from information_schema.columns
where table_schema = 'public' and column_name in ('created_at', 'updated_at', 'deleted_at') \gset
:q;
\echo === proyectos tocados desde el corte (incluye ediciones y borrados de proyectos existentes)
select id, project_code, version, is_deleted, created_at, updated_at, deleted_at
from projects where updated_at > :'since'::timestamptz or created_at > :'since'::timestamptz or deleted_at > :'since'::timestamptz
order by updated_at;
