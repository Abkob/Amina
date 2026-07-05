import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

interface TableRow extends Record<string, unknown> {
  table_name: string;
  total_bytes: string;
  index_count: string;
}

interface ColumnRow extends Record<string, unknown> {
  table_name: string;
  ordinal_position: number;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
  is_primary: boolean;
  is_unique: boolean;
}

interface IndexRow extends Record<string, unknown> {
  table_name: string;
  index_name: string;
  index_definition: string;
}

interface ForeignKeyRow extends Record<string, unknown> {
  constraint_name: string;
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
  delete_rule: string;
  is_validated: boolean;
}

const LOGICAL_RELATIONSHIPS = [
  { source_table: 'edges', source_column: 'source_id', target_table: 'goals', target_column: 'id', label: 'polymorphic source', note: 'When source_type = goal' },
  { source_table: 'edges', source_column: 'source_id', target_table: 'tasks', target_column: 'id', label: 'polymorphic source', note: 'When source_type = task' },
  { source_table: 'edges', source_column: 'source_id', target_table: 'resources', target_column: 'id', label: 'polymorphic source', note: 'When source_type = resource' },
  { source_table: 'edges', source_column: 'source_id', target_table: 'meetings', target_column: 'id', label: 'polymorphic source', note: 'When source_type = meeting' },
  { source_table: 'edges', source_column: 'source_id', target_table: 'notes', target_column: 'id', label: 'polymorphic source', note: 'When source_type = note' },
  { source_table: 'edges', source_column: 'target_id', target_table: 'goals', target_column: 'id', label: 'polymorphic target', note: 'When target_type = goal' },
  { source_table: 'edges', source_column: 'target_id', target_table: 'tasks', target_column: 'id', label: 'polymorphic target', note: 'When target_type = task' },
  { source_table: 'edges', source_column: 'target_id', target_table: 'resources', target_column: 'id', label: 'polymorphic target', note: 'When target_type = resource' },
  { source_table: 'edges', source_column: 'target_id', target_table: 'meetings', target_column: 'id', label: 'polymorphic target', note: 'When target_type = meeting' },
  { source_table: 'edges', source_column: 'target_id', target_table: 'notes', target_column: 'id', label: 'polymorphic target', note: 'When target_type = note' },
  { source_table: 'entity_summaries', source_column: 'entity_id', target_table: 'goals', target_column: 'id', label: 'summarizes', note: 'Selected by entity_type' },
  { source_table: 'entity_summaries', source_column: 'entity_id', target_table: 'tasks', target_column: 'id', label: 'summarizes', note: 'Selected by entity_type' },
  { source_table: 'entity_summaries', source_column: 'entity_id', target_table: 'resources', target_column: 'id', label: 'summarizes', note: 'Selected by entity_type' },
  { source_table: 'entity_summaries', source_column: 'entity_id', target_table: 'meetings', target_column: 'id', label: 'summarizes', note: 'Selected by entity_type' },
  { source_table: 'entity_summaries', source_column: 'entity_id', target_table: 'goal_milestones', target_column: 'id', label: 'summarizes', note: 'Selected by entity_type' },
  { source_table: 'embeddings', source_column: 'entity_id', target_table: 'goals', target_column: 'id', label: 'vectorizes', note: 'Selected by entity_type' },
  { source_table: 'embeddings', source_column: 'entity_id', target_table: 'tasks', target_column: 'id', label: 'vectorizes', note: 'Selected by entity_type' },
  { source_table: 'embeddings', source_column: 'entity_id', target_table: 'resources', target_column: 'id', label: 'vectorizes', note: 'Selected by entity_type' },
  { source_table: 'embeddings', source_column: 'entity_id', target_table: 'journal_entries', target_column: 'id', label: 'vectorizes', note: 'Selected by entity_type' },
  { source_table: 'embeddings', source_column: 'entity_id', target_table: 'notes', target_column: 'id', label: 'vectorizes', note: 'Selected by entity_type' },
  { source_table: 'embeddings', source_column: 'entity_id', target_table: 'resource_chunks', target_column: 'id', label: 'vectorizes', note: 'Selected by entity_type' },
  { source_table: 'embeddings', source_column: 'chunk_id', target_table: 'resource_chunks', target_column: 'id', label: 'embeds chunk', note: 'Optional direct chunk identity' },
  { source_table: 'embedding_jobs', source_column: 'entity_id', target_table: 'embeddings', target_column: 'entity_id', label: 'builds vector', note: 'Queue-to-vector lifecycle' },
  { source_table: 'embedding_jobs', source_column: 'chunk_id', target_table: 'resource_chunks', target_column: 'id', label: 'queues chunk', note: 'Optional chunk-scoped job' },
  { source_table: 'entity_tags', source_column: 'entity_id', target_table: 'goals', target_column: 'id', label: 'tags entity', note: 'Selected by entity_type' },
  { source_table: 'entity_tags', source_column: 'entity_id', target_table: 'tasks', target_column: 'id', label: 'tags entity', note: 'Selected by entity_type' },
  { source_table: 'entity_tags', source_column: 'entity_id', target_table: 'resources', target_column: 'id', label: 'tags entity', note: 'Selected by entity_type' },
  { source_table: 'topic_memberships', source_column: 'entity_id', target_table: 'goals', target_column: 'id', label: 'clusters entity', note: 'Selected by entity_type' },
  { source_table: 'topic_memberships', source_column: 'entity_id', target_table: 'tasks', target_column: 'id', label: 'clusters entity', note: 'Selected by entity_type' },
  { source_table: 'topic_memberships', source_column: 'entity_id', target_table: 'resources', target_column: 'id', label: 'clusters entity', note: 'Selected by entity_type' },
  { source_table: 'topic_memberships', source_column: 'entity_id', target_table: 'journal_entries', target_column: 'id', label: 'clusters entity', note: 'Selected by entity_type' },
  { source_table: 'topic_memberships', source_column: 'entity_id', target_table: 'goal_milestones', target_column: 'id', label: 'clusters entity', note: 'Selected by entity_type' },
  { source_table: 'topic_memberships', source_column: 'entity_id', target_table: 'meetings', target_column: 'id', label: 'clusters entity', note: 'Selected by entity_type' },
  { source_table: 'journal_links', source_column: 'target_id', target_table: 'goals', target_column: 'id', label: 'journal evidence', note: 'Selected by target_type' },
  { source_table: 'journal_links', source_column: 'target_id', target_table: 'tasks', target_column: 'id', label: 'journal evidence', note: 'Selected by target_type' },
  { source_table: 'journal_links', source_column: 'target_id', target_table: 'resources', target_column: 'id', label: 'journal evidence', note: 'Selected by target_type' },
  { source_table: 'journal_links', source_column: 'target_id', target_table: 'meetings', target_column: 'id', label: 'journal evidence', note: 'Selected by target_type' },
  { source_table: 'journal_links', source_column: 'target_id', target_table: 'goal_milestones', target_column: 'id', label: 'journal evidence', note: 'Selected by target_type' },
  { source_table: 'extracted_facts', source_column: 'source_id', target_table: 'journal_entries', target_column: 'id', label: 'extracted from', note: 'Usually created by journal ingestion' },
  { source_table: 'extracted_facts', source_column: 'target_id', target_table: 'goals', target_column: 'id', label: 'fact about', note: 'Selected by target_type' },
  { source_table: 'extracted_facts', source_column: 'target_id', target_table: 'tasks', target_column: 'id', label: 'fact about', note: 'Selected by target_type' },
  { source_table: 'ai_action_proposals', source_column: 'source_id', target_table: 'journal_entries', target_column: 'id', label: 'proposed from', note: 'Source is polymorphic' },
  { source_table: 'ai_action_proposals', source_column: 'source_id', target_table: 'notes', target_column: 'id', label: 'proposed from', note: 'Source is polymorphic' },
  { source_table: 'journal_entries', source_column: 'source_note_id', target_table: 'notes', target_column: 'id', label: 'ingested from note', note: 'Application-managed source link' },
  { source_table: 'meetings', source_column: 'milestone_id', target_table: 'goal_milestones', target_column: 'id', label: 'supports milestone', note: 'Application-managed relationship' },
  { source_table: 'entity_aliases', source_column: 'entity_id', target_table: 'goals', target_column: 'id', label: 'aliases entity', note: 'Selected by entity_type' },
  { source_table: 'entity_aliases', source_column: 'entity_id', target_table: 'tasks', target_column: 'id', label: 'aliases entity', note: 'Selected by entity_type' },
  { source_table: 'entity_aliases', source_column: 'entity_id', target_table: 'resources', target_column: 'id', label: 'aliases entity', note: 'Selected by entity_type' },
].map((relationship, index) => ({
  id: `logical-${index + 1}`,
  kind: 'logical' as const,
  ...relationship,
}));

// GET /api/database-atlas — live, read-only schema metadata for the dashboard ERD.
router.get('/', async (_req, res) => {
  const [
    { rows: tables },
    { rows: columns },
    { rows: indexes },
    { rows: foreignKeys },
    { rows: databaseMeta },
  ] = await Promise.all([
    query<TableRow>(`
      SELECT
        c.relname AS table_name,
        pg_total_relation_size(c.oid)::bigint::text AS total_bytes,
        COUNT(DISTINCT i.indexrelid)::int::text AS index_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_index i ON i.indrelid = c.oid
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      GROUP BY c.oid, c.relname
      ORDER BY c.relname
    `),
    query<ColumnRow>(`
      SELECT
        c.table_name,
        c.ordinal_position,
        c.column_name,
        c.data_type,
        c.udt_name,
        c.is_nullable,
        c.column_default,
        EXISTS (
          SELECT 1
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON kcu.constraint_name = tc.constraint_name
           AND kcu.constraint_schema = tc.constraint_schema
          WHERE tc.table_schema = 'public'
            AND tc.table_name = c.table_name
            AND tc.constraint_type = 'PRIMARY KEY'
            AND kcu.column_name = c.column_name
        ) AS is_primary,
        EXISTS (
          SELECT 1
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON kcu.constraint_name = tc.constraint_name
           AND kcu.constraint_schema = tc.constraint_schema
          WHERE tc.table_schema = 'public'
            AND tc.table_name = c.table_name
            AND tc.constraint_type = 'UNIQUE'
            AND kcu.column_name = c.column_name
            AND (
              SELECT COUNT(*)
              FROM information_schema.key_column_usage kcu2
              WHERE kcu2.constraint_schema = tc.constraint_schema
                AND kcu2.constraint_name = tc.constraint_name
            ) = 1
        ) AS is_unique
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
      ORDER BY c.table_name, c.ordinal_position
    `),
    query<IndexRow>(`
      SELECT
        tablename AS table_name,
        indexname AS index_name,
        indexdef AS index_definition
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `),
    query<ForeignKeyRow>(`
      SELECT
        con.conname AS constraint_name,
        src.relname AS source_table,
        src_col.attname AS source_column,
        tgt.relname AS target_table,
        tgt_col.attname AS target_column,
        CASE con.confdeltype
          WHEN 'c' THEN 'CASCADE'
          WHEN 'n' THEN 'SET NULL'
          WHEN 'r' THEN 'RESTRICT'
          WHEN 'a' THEN 'NO ACTION'
          ELSE 'OTHER'
        END AS delete_rule,
        con.convalidated AS is_validated
      FROM pg_constraint con
      JOIN pg_class src ON src.oid = con.conrelid
      JOIN pg_class tgt ON tgt.oid = con.confrelid
      JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS sk(attnum, ord) ON true
      JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS tk(attnum, ord) ON tk.ord = sk.ord
      JOIN pg_attribute src_col ON src_col.attrelid = src.oid AND src_col.attnum = sk.attnum
      JOIN pg_attribute tgt_col ON tgt_col.attrelid = tgt.oid AND tgt_col.attnum = tk.attnum
      WHERE con.contype = 'f'
        AND con.connamespace = 'public'::regnamespace
      ORDER BY src.relname, con.conname, sk.ord
    `),
    query<{ database_name: string; database_bytes: string; server_version: string }>(`
      SELECT
        current_database() AS database_name,
        pg_database_size(current_database())::bigint::text AS database_bytes,
        current_setting('server_version') AS server_version
    `),
  ]);

  // Names originate from PostgreSQL's own catalog. Quote defensively before
  // using them in exact-count queries.
  const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;
  const counts = await Promise.all(
    tables.map(async table => {
      const result = await query<{ row_count: string }>(
        `SELECT COUNT(*)::bigint::text AS row_count FROM ${quoteIdentifier(table.table_name)}`,
      );
      return [table.table_name, Number(result.rows[0]?.row_count ?? 0)] as const;
    }),
  );
  const rowCounts = new Map(counts);

  const columnsByTable = new Map<string, ColumnRow[]>();
  for (const column of columns) {
    const list = columnsByTable.get(column.table_name) ?? [];
    list.push(column);
    columnsByTable.set(column.table_name, list);
  }

  const indexesByTable = new Map<string, IndexRow[]>();
  for (const index of indexes) {
    const list = indexesByTable.get(index.table_name) ?? [];
    list.push(index);
    indexesByTable.set(index.table_name, list);
  }

  const tablePayload = tables.map(table => ({
    name: table.table_name,
    row_count: rowCounts.get(table.table_name) ?? 0,
    total_bytes: Number(table.total_bytes),
    index_count: Number(table.index_count),
    columns: (columnsByTable.get(table.table_name) ?? []).map(column => ({
      name: column.column_name,
      position: Number(column.ordinal_position),
      data_type: column.data_type === 'USER-DEFINED' ? column.udt_name : column.data_type,
      nullable: column.is_nullable === 'YES',
      default_value: column.column_default,
      is_primary: Boolean(column.is_primary),
      is_unique: Boolean(column.is_unique),
    })),
    indexes: (indexesByTable.get(table.table_name) ?? []).map(index => ({
      name: index.index_name,
      definition: index.index_definition,
    })),
  }));

  const physicalRelationships = foreignKeys.map((fk, index) => ({
    id: `fk-${index + 1}-${fk.constraint_name}`,
    kind: 'physical' as const,
    source_table: fk.source_table,
    source_column: fk.source_column,
    target_table: fk.target_table,
    target_column: fk.target_column,
    label: fk.delete_rule === 'CASCADE' ? 'owns / cascades' : 'references',
    note: `${fk.constraint_name} · ON DELETE ${fk.delete_rule}${fk.is_validated ? '' : ' · NOT VALID'}`,
    is_validated: Boolean(fk.is_validated),
  }));

  const totalRows = tablePayload.reduce((sum, table) => sum + table.row_count, 0);
  const meta = databaseMeta[0];

  res.json({
    generated_at: new Date().toISOString(),
    database: {
      name: meta?.database_name ?? 'unknown',
      total_bytes: Number(meta?.database_bytes ?? 0),
      server_version: meta?.server_version ?? 'unknown',
    },
    summary: {
      tables: tablePayload.length,
      columns: columns.length,
      rows: totalRows,
      indexes: indexes.length,
      physical_relationships: physicalRelationships.length,
      logical_relationships: LOGICAL_RELATIONSHIPS.length,
    },
    tables: tablePayload,
    relationships: [...physicalRelationships, ...LOGICAL_RELATIONSHIPS],
  });
});

export { router as databaseAtlasRouter };
