// Diagnostic: show the raw model output for a copilot-style request.
// Usage: npx tsx scripts/debug-chat-raw.ts
import { Ollama } from 'ollama';

const ollama = new Ollama({ host: process.env.OLLAMA_HOST ?? 'http://localhost:11434' });

const system = `You are a personal productivity assistant. Respond with ONLY a single JSON object, no markdown fences, in this exact shape:
{
  "reply": "conversational answer",
  "actions": [
    { "id": "a1", "type": "create_task", "description": "...", "params": { "goal_id": "...", "title": "...", "due_date": "YYYY-MM-DD", "estimated_minutes": 60 } }
  ]
}

## Current data
Goals: [{"id":"goal-1","title":"Launch v2.0 Design System"}]
Rules: actions[] may be empty if no changes are needed. Dates must be YYYY-MM-DD.`;

const res = await ollama.chat({
  model: 'qwen3:8b',
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: 'Create a task called Verify Pipeline Test under the design system goal, due 2026-07-10, estimated 60 minutes. Just create that one task.' },
  ],
  think: false,
  options: { temperature: 0.3, num_predict: 2048 },
});

console.log('=== RAW CONTENT START ===');
console.log(res.message.content);
console.log('=== RAW CONTENT END ===');
console.log('thinking field present:', 'thinking' in res.message, '| content length:', res.message.content.length);
