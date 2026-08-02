import { Router } from 'express';
import { z } from 'zod';
import { buildToolPlan, interpretObjective } from '../services/semanticOrchestrator.js';
import { searchResearchEvidence } from '../services/researchRag.js';

export const orchestratorRouter = Router();

orchestratorRouter.post('/interpret', async (req, res) => {
  const { message, execute_read_only } = z.object({ message: z.string().min(1).max(10_000), execute_read_only: z.boolean().default(true) }).parse(req.body);
  const frame = interpretObjective(message);
  const plan = buildToolPlan(frame);
  const result: Record<string, unknown> = {};
  if (execute_read_only && plan[0]?.tool === 'research.search') {
    result.evidence = await searchResearchEvidence(message);
  }
  res.json({ frame, plan, result, state_changed: false });
});
