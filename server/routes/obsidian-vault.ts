import { Router } from 'express';
import {
  getObsidianVaultStatus,
  scheduleObsidianVaultSync,
  syncObsidianVault,
} from '../services/obsidianVaultSync.js';

const router = Router();

router.get('/status', (_req, res) => {
  res.json(getObsidianVaultStatus());
});

router.post('/sync', async (req, res) => {
  const force = req.body?.force !== false;
  if (!force) {
    return res.json(scheduleObsidianVaultSync('manual queued'));
  }
  const result = await syncObsidianVault('manual');
  res.json(result);
});

export { router as obsidianVaultRouter };
