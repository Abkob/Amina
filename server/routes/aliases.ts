import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// GET /api/entity-aliases — list all AI-learned aliases
// Optional filters: ?entity_type=task&entity_id=xxx&created_by=ai
router.get('/', async (req, res) => {
  const { entity_type, entity_id, created_by } = req.query;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (entity_type) { conditions.push(`ea.entity_type=$${params.length + 1}`); params.push(entity_type); }
  if (entity_id)   { conditions.push(`ea.entity_id=$${params.length + 1}`);   params.push(entity_id); }
  if (created_by)  { conditions.push(`ea.created_by=$${params.length + 1}`);  params.push(created_by); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT ea.*,
       COALESCE(g.title, t.title, m.title, r.title, gm.title, n.title) as entity_title
     FROM entity_aliases ea
     LEFT JOIN goals          g  ON ea.entity_type='goal'      AND ea.entity_id=g.id
     LEFT JOIN tasks          t  ON ea.entity_type='task'      AND ea.entity_id=t.id
     LEFT JOIN meetings       m  ON ea.entity_type='meeting'   AND ea.entity_id=m.id
     LEFT JOIN resources      r  ON ea.entity_type='resource'  AND ea.entity_id=r.id
     LEFT JOIN goal_milestones gm ON ea.entity_type='milestone' AND ea.entity_id=gm.id
     LEFT JOIN notes          n  ON ea.entity_type='note'      AND ea.entity_id=n.id
     ${where}
     ORDER BY ea.created_at DESC
     LIMIT 500`,
    params,
  );
  res.json(rows);
});

// DELETE /api/entity-aliases/:id — remove a single alias
router.delete('/:id', async (req, res) => {
  await query('DELETE FROM entity_aliases WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// DELETE /api/entity-aliases — bulk delete by entity
// Body: { entity_type, entity_id }
router.delete('/', async (req, res) => {
  const { entity_type, entity_id } = req.body as Record<string, unknown>;
  if (!entity_type || !entity_id) {
    return res.status(400).json({ error: 'entity_type and entity_id required' });
  }
  await query(
    'DELETE FROM entity_aliases WHERE entity_type=$1 AND entity_id=$2',
    [entity_type, entity_id],
  );
  res.json({ ok: true });
});

export { router as aliasesRouter };
