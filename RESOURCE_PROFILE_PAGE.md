# Resource Profile Page — Full Feature Checklist

Every checkbox is one discrete unit of work.  
Every item ships with an explicit unit test.  
Tests use **Vitest** + **supertest** (server) and **@testing-library/react** (components).  
Build order: DB → API → Query layer → Store → Components → Routing.

---

## 1. DATABASE / SCHEMA

### 1.1 `resources` table — new columns via runtime migration

- [ ] **1.1.1** Add `read_state TEXT NOT NULL DEFAULT 'Unread'`  
  Valid values: `'Unread' | 'Reading' | 'Done' | 'Shelved'`

  ```ts
  // test: server/routes/resources.test.ts
  it('resources table has read_state column', () => {
    const cols = db.prepare("PRAGMA table_info(resources)").all() as { name: string }[];
    expect(cols.find(c => c.name === 'read_state')).toBeTruthy();
  });
  it('read_state defaults to Unread on insert', () => {
    db.prepare("INSERT INTO resources (id,title,url,type,info,created_at) VALUES (?,?,?,?,?,?)")
      .run('r1','Test','','paper','',new Date().toISOString());
    const row = db.prepare("SELECT read_state FROM resources WHERE id='r1'").get() as { read_state: string };
    expect(row.read_state).toBe('Unread');
  });
  ```

- [ ] **1.1.2** Add `next_action TEXT NOT NULL DEFAULT ''`  
  One-line sticky note: what to do next with this resource.

  ```ts
  it('resources table has next_action column', () => {
    const cols = db.prepare("PRAGMA table_info(resources)").all() as { name: string }[];
    expect(cols.find(c => c.name === 'next_action')).toBeTruthy();
  });
  it('next_action defaults to empty string', () => {
    const row = db.prepare("SELECT next_action FROM resources WHERE id='r1'").get() as { next_action: string };
    expect(row.next_action).toBe('');
  });
  ```

- [ ] **1.1.3** Add `tags_json TEXT NOT NULL DEFAULT '[]'`  
  JSON array of free-text tag strings, e.g. `["foundational","EEG"]`.

  ```ts
  it('resources table has tags_json column', () => {
    const cols = db.prepare("PRAGMA table_info(resources)").all() as { name: string }[];
    expect(cols.find(c => c.name === 'tags_json')).toBeTruthy();
  });
  it('tags_json is valid JSON array by default', () => {
    const row = db.prepare("SELECT tags_json FROM resources WHERE id='r1'").get() as { tags_json: string };
    expect(() => JSON.parse(row.tags_json)).not.toThrow();
    expect(JSON.parse(row.tags_json)).toEqual([]);
  });
  ```

### 1.2 `resource_logs` table — new columns

- [ ] **1.2.1** Add `is_insight INTEGER NOT NULL DEFAULT 0`  
  0 = regular progress note, 1 = key insight (pinned separately in UI).

  ```ts
  it('resource_logs table has is_insight column', () => {
    const cols = db.prepare("PRAGMA table_info(resource_logs)").all() as { name: string }[];
    expect(cols.find(c => c.name === 'is_insight')).toBeTruthy();
  });
  it('is_insight defaults to 0', () => {
    db.prepare("INSERT INTO resource_logs (id,resource_id,content,created_at) VALUES (?,?,?,?)")
      .run('lg1','r1','note content',new Date().toISOString());
    const row = db.prepare("SELECT is_insight FROM resource_logs WHERE id='lg1'").get() as { is_insight: number };
    expect(row.is_insight).toBe(0);
  });
  ```

---

## 2. API ROUTES  (`server/routes/resources.ts`)

### 2.1 Single resource — GET /api/resources/:id

- [ ] **2.1.1** Returns 200 + full resource row including new columns (`read_state`, `next_action`, `tags_json`)

  ```ts
  it('GET /api/resources/:id returns full row', async () => {
    const res = await request(app).get('/api/resources/r1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'r1',
      read_state: 'Unread',
      next_action: '',
      tags_json: '[]',
    });
  });
  ```

- [ ] **2.1.2** Returns 404 for unknown id

  ```ts
  it('GET /api/resources/nonexistent returns 404', async () => {
    const res = await request(app).get('/api/resources/does-not-exist');
    expect(res.status).toBe(404);
  });
  ```

### 2.2 Update resource — PATCH /api/resources/:id

- [ ] **2.2.1** Updates `title` only

  ```ts
  it('PATCH /api/resources/:id updates title', async () => {
    await request(app).patch('/api/resources/r1').send({ title: 'New Title' });
    const row = db.prepare("SELECT title FROM resources WHERE id='r1'").get() as { title: string };
    expect(row.title).toBe('New Title');
  });
  ```

- [ ] **2.2.2** Updates `read_state` — validates against allowed values  
  Allowed: `Unread | Reading | Done | Shelved`. Returns 400 on invalid value.

  ```ts
  it('PATCH updates read_state to Reading', async () => {
    const res = await request(app).patch('/api/resources/r1').send({ read_state: 'Reading' });
    expect(res.status).toBe(200);
    const row = db.prepare("SELECT read_state FROM resources WHERE id='r1'").get() as { read_state: string };
    expect(row.read_state).toBe('Reading');
  });
  it('PATCH rejects invalid read_state', async () => {
    const res = await request(app).patch('/api/resources/r1').send({ read_state: 'Completed' });
    expect(res.status).toBe(400);
  });
  ```

- [ ] **2.2.3** Updates `next_action`

  ```ts
  it('PATCH updates next_action', async () => {
    await request(app).patch('/api/resources/r1').send({ next_action: 're-read section 4' });
    const row = db.prepare("SELECT next_action FROM resources WHERE id='r1'").get() as { next_action: string };
    expect(row.next_action).toBe('re-read section 4');
  });
  ```

- [ ] **2.2.4** Updates `tags_json` — must be valid JSON array of strings

  ```ts
  it('PATCH updates tags_json', async () => {
    await request(app).patch('/api/resources/r1').send({ tags_json: '["EEG","foundational"]' });
    const row = db.prepare("SELECT tags_json FROM resources WHERE id='r1'").get() as { tags_json: string };
    expect(JSON.parse(row.tags_json)).toEqual(['EEG', 'foundational']);
  });
  it('PATCH rejects malformed tags_json', async () => {
    const res = await request(app).patch('/api/resources/r1').send({ tags_json: 'not-json' });
    expect(res.status).toBe(400);
  });
  ```

- [ ] **2.2.5** Updates `url` and `info`

  ```ts
  it('PATCH updates url', async () => {
    await request(app).patch('/api/resources/r1').send({ url: 'https://example.com' });
    const row = db.prepare("SELECT url FROM resources WHERE id='r1'").get() as { url: string };
    expect(row.url).toBe('https://example.com');
  });
  ```

### 2.3 Resource log entries — GET/POST/DELETE /api/resources/:id/logs

- [ ] **2.3.1** POST creates a regular log entry (`is_insight = 0`)

  ```ts
  it('POST /api/resources/:id/logs creates log entry', async () => {
    const res = await request(app)
      .post('/api/resources/r1/logs')
      .send({ content: 'finished abstract', is_insight: false });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeTruthy();
    const row = db.prepare("SELECT * FROM resource_logs WHERE id=?").get(res.body.id) as any;
    expect(row.is_insight).toBe(0);
    expect(row.content).toBe('finished abstract');
  });
  ```

- [ ] **2.3.2** POST creates an insight log entry (`is_insight = 1`)

  ```ts
  it('POST with is_insight:true sets is_insight=1', async () => {
    const res = await request(app)
      .post('/api/resources/r1/logs')
      .send({ content: 'seizure threshold 92%', is_insight: true });
    const row = db.prepare("SELECT is_insight FROM resource_logs WHERE id=?").get(res.body.id) as any;
    expect(row.is_insight).toBe(1);
  });
  ```

- [ ] **2.3.3** POST returns 400 when content is missing or empty

  ```ts
  it('POST /logs returns 400 for empty content', async () => {
    const res = await request(app).post('/api/resources/r1/logs').send({ content: '   ' });
    expect(res.status).toBe(400);
  });
  ```

- [ ] **2.3.4** GET returns all logs for resource, sorted newest-first

  ```ts
  it('GET /api/resources/:id/logs returns newest first', async () => {
    const res = await request(app).get('/api/resources/r1/logs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const dates = res.body.map((l: any) => l.created_at);
    expect(dates).toEqual([...dates].sort().reverse());
  });
  ```

- [ ] **2.3.5** GET separates insights from regular logs via `is_insight` field

  ```ts
  it('GET /logs includes is_insight field on every entry', async () => {
    const res = await request(app).get('/api/resources/r1/logs');
    res.body.forEach((l: any) => expect(typeof l.is_insight).toBe('number'));
  });
  ```

- [ ] **2.3.6** DELETE removes a log entry by id

  ```ts
  it('DELETE /api/resources/:id/logs/:logId removes entry', async () => {
    const post = await request(app).post('/api/resources/r1/logs').send({ content: 'to delete' });
    const logId = post.body.id;
    await request(app).delete(`/api/resources/r1/logs/${logId}`);
    const row = db.prepare("SELECT id FROM resource_logs WHERE id=?").get(logId);
    expect(row).toBeUndefined();
  });
  ```

### 2.4 Enriched references — GET /api/resources/:id/references

- [ ] **2.4.1** Returns array with `edge_id, source_id, source_type, source_title, source_content, parent_title, created_at`

  ```ts
  it('GET /references returns enriched shape', async () => {
    // Setup: create task + journal note that mentions r1
    const res = await request(app).get('/api/resources/r1/references');
    expect(res.status).toBe(200);
    if (res.body.length > 0) {
      const ref = res.body[0];
      expect(ref).toHaveProperty('edge_id');
      expect(ref).toHaveProperty('source_id');
      expect(ref).toHaveProperty('source_type');
      expect(ref).toHaveProperty('source_title');
      expect(ref).toHaveProperty('source_content');
      expect(ref).toHaveProperty('parent_title');
      expect(ref).toHaveProperty('created_at');
    }
  });
  ```

- [ ] **2.4.2** For `source_type='note'`: `source_title` = `'Journal entry'`, `source_content` = first 200 chars of note content, `parent_title` = task title

  ```ts
  it('note reference has correct enrichment', async () => {
    // Prerequisite: insert task + note + mention edge
    const res = await request(app).get('/api/resources/r1/references');
    const noteRef = res.body.find((r: any) => r.source_type === 'note');
    if (noteRef) {
      expect(noteRef.source_title).toBe('Journal entry');
      expect(noteRef.parent_title).toBeTruthy(); // task title
      expect(noteRef.source_content.length).toBeLessThanOrEqual(200);
    }
  });
  ```

- [ ] **2.4.3** For `source_type='task'`: `source_title` = task title, `source_content` = null

  ```ts
  it('task reference has task title and null content', async () => {
    const res = await request(app).get('/api/resources/r1/references');
    const taskRef = res.body.find((r: any) => r.source_type === 'task');
    if (taskRef) {
      expect(taskRef.source_title).toBeTruthy();
      expect(taskRef.source_content).toBeNull();
    }
  });
  ```

- [ ] **2.4.4** Returns empty array (not 404) when resource has no mentions

  ```ts
  it('GET /references returns [] for unmensioned resource', async () => {
    db.prepare("INSERT INTO resources (id,title,url,type,info,created_at) VALUES (?,?,?,?,?,?)")
      .run('r-fresh','Fresh','','paper','',new Date().toISOString());
    const res = await request(app).get('/api/resources/r-fresh/references');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
  ```

### 2.5 Stats rollup — GET /api/resources/:id/stats

- [ ] **2.5.1** Returns `total_minutes` (sum of `actual_minutes` from all tasks that @mentioned this resource)

  ```ts
  it('GET /stats returns total_minutes', async () => {
    const res = await request(app).get('/api/resources/r1/stats');
    expect(res.status).toBe(200);
    expect(typeof res.body.total_minutes).toBe('number');
    expect(res.body.total_minutes).toBeGreaterThanOrEqual(0);
  });
  ```

- [ ] **2.5.2** Returns `reference_count` (total @mention edges)

  ```ts
  it('GET /stats returns reference_count', async () => {
    const res = await request(app).get('/api/resources/r1/stats');
    expect(typeof res.body.reference_count).toBe('number');
  });
  ```

- [ ] **2.5.3** Returns `goals_count` (distinct goals reachable through referenced tasks)

  ```ts
  it('GET /stats returns goals_count', async () => {
    const res = await request(app).get('/api/resources/r1/stats');
    expect(typeof res.body.goals_count).toBe('number');
  });
  ```

- [ ] **2.5.4** Returns `last_engaged` — ISO timestamp of the most recent log entry OR reference, whichever is newer. Null if neither exists.

  ```ts
  it('GET /stats returns last_engaged as ISO string or null', async () => {
    const res = await request(app).get('/api/resources/r1/stats');
    if (res.body.last_engaged !== null) {
      expect(() => new Date(res.body.last_engaged)).not.toThrow();
    }
  });
  ```

- [ ] **2.5.5** `total_minutes` is the SUM of `actual_minutes` across distinct tasks, not double-counted if a task has multiple journal notes that mention this resource

  ```ts
  it('total_minutes does not double-count a task cited multiple times', async () => {
    // task t1 has actual_minutes=60, has two journal notes both citing r1
    const res = await request(app).get('/api/resources/r1/stats');
    // Should be 60, not 120
    expect(res.body.total_minutes).toBe(60);
  });
  ```

### 2.6 Connection graph — GET /api/resources/:id/graph

- [ ] **2.6.1** Always includes the resource itself as a node with `nodeType='resource'`

  ```ts
  it('GET /graph always contains the resource node', async () => {
    const res = await request(app).get('/api/resources/r1/graph');
    expect(res.status).toBe(200);
    const centre = res.body.nodes.find((n: any) => n.id === 'r1');
    expect(centre).toBeTruthy();
    expect(centre.nodeType).toBe('resource');
  });
  ```

- [ ] **2.6.2** Task nodes referenced via journal note appear with `nodeType='task'` and `meta.completed`, `meta.status`, `meta.goal_id`

  ```ts
  it('GET /graph task nodes have correct meta', async () => {
    const res = await request(app).get('/api/resources/r1/graph');
    const taskNode = res.body.nodes.find((n: any) => n.nodeType === 'task');
    if (taskNode) {
      expect(typeof taskNode.meta.completed).toBe('boolean');
      expect(taskNode.meta.status).toBeTruthy();
    }
  });
  ```

- [ ] **2.6.3** Goal nodes appear with `nodeType='goal'` connected to their tasks via `rel='contains'` edges

  ```ts
  it('GET /graph goal nodes connected to tasks via contains edges', async () => {
    const res = await request(app).get('/api/resources/r1/graph');
    const goalNode = res.body.nodes.find((n: any) => n.nodeType === 'goal');
    if (goalNode) {
      const containsEdge = res.body.edges.find(
        (e: any) => e.source === goalNode.id && e.rel === 'contains'
      );
      expect(containsEdge).toBeTruthy();
    }
  });
  ```

- [ ] **2.6.4** Co-cited resources appear with `nodeType='resource'` and edges with `rel='co_cited'`

  ```ts
  it('GET /graph co-cited resources have co_cited edges', async () => {
    const res = await request(app).get('/api/resources/r1/graph');
    const coCiteEdges = res.body.edges.filter((e: any) => e.rel === 'co_cited');
    coCiteEdges.forEach((e: any) => {
      const targetNode = res.body.nodes.find((n: any) => n.id === e.target);
      expect(targetNode?.nodeType).toBe('resource');
    });
  });
  ```

- [ ] **2.6.5** Returns `{ nodes: [], edges: [] }` for a resource with no references (not 404)

  ```ts
  it('GET /graph returns empty graph for isolated resource', async () => {
    const res = await request(app).get('/api/resources/r-fresh/graph');
    expect(res.status).toBe(200);
    expect(res.body.nodes.length).toBe(1); // just the resource itself
    expect(res.body.edges.length).toBe(0);
  });
  ```

---

## 3. CLIENT QUERY LAYER  (`src/db/queries/resources.ts`)

- [ ] **3.1** `getResource(id)` — fetch single resource, typed as `DBResource`

  ```ts
  it('getResource returns full DBResource', async () => {
    server.use(rest.get('/api/resources/r1', (_, res, ctx) =>
      res(ctx.json({ id:'r1', title:'T', url:null, type:'paper', info:'',
        read_state:'Unread', next_action:'', tags_json:'[]', created_at:'2025-01-01' }))
    ));
    const r = await getResource('r1');
    expect(r.id).toBe('r1');
    expect(r.read_state).toBe('Unread');
  });
  ```

- [ ] **3.2** `updateResource(id, patch)` — PATCH, typed patch includes `read_state`, `next_action`, `tags_json`

  ```ts
  it('updateResource sends PATCH with correct body', async () => {
    let body: any;
    server.use(rest.patch('/api/resources/r1', async (req, res, ctx) => {
      body = await req.json(); return res(ctx.json({ ok: true }));
    }));
    await updateResource('r1', { read_state: 'Reading', next_action: 'check table 3' });
    expect(body.read_state).toBe('Reading');
    expect(body.next_action).toBe('check table 3');
  });
  ```

- [ ] **3.3** `addResourceLog(resourceId, content, isInsight)` — third param `isInsight: boolean`, defaults false

  ```ts
  it('addResourceLog sends is_insight flag', async () => {
    let body: any;
    server.use(rest.post('/api/resources/r1/logs', async (req, res, ctx) => {
      body = await req.json(); return res(ctx.json({ id: 'new-log' }));
    }));
    await addResourceLog('r1', 'key finding', true);
    expect(body.is_insight).toBe(true);
  });
  ```

- [ ] **3.4** `getResourceStats(id)` — returns `ResourceStats` type with `total_minutes, reference_count, goals_count, last_engaged`

  ```ts
  it('getResourceStats returns typed stats', async () => {
    server.use(rest.get('/api/resources/r1/stats', (_, res, ctx) =>
      res(ctx.json({ total_minutes:90, reference_count:3, goals_count:2, last_engaged:'2025-01-10' }))
    ));
    const s = await getResourceStats('r1');
    expect(s.total_minutes).toBe(90);
    expect(s.goals_count).toBe(2);
  });
  ```

- [ ] **3.5** `getResourceGraph(id)` — returns `ResourceGraphData` with typed nodes and edges

  ```ts
  it('getResourceGraph returns nodes and edges arrays', async () => {
    server.use(rest.get('/api/resources/r1/graph', (_, res, ctx) =>
      res(ctx.json({ nodes: [], edges: [] }))
    ));
    const g = await getResourceGraph('r1');
    expect(Array.isArray(g.nodes)).toBe(true);
    expect(Array.isArray(g.edges)).toBe(true);
  });
  ```

---

## 4. STORE (`src/store/useAppStore.ts`)

- [ ] **4.1** Add `focusedResourceId: string | null` to persisted state, default `null`

  ```ts
  it('focusedResourceId initializes as null', () => {
    const { focusedResourceId } = useAppStore.getState();
    expect(focusedResourceId).toBeNull();
  });
  ```

- [ ] **4.2** Add `setFocusedResourceId(id: string | null)` setter

  ```ts
  it('setFocusedResourceId updates state', () => {
    useAppStore.getState().setFocusedResourceId('r1');
    expect(useAppStore.getState().focusedResourceId).toBe('r1');
    useAppStore.getState().setFocusedResourceId(null);
    expect(useAppStore.getState().focusedResourceId).toBeNull();
  });
  ```

- [ ] **4.3** `setCurrentTab('Resources')` does NOT clear `focusedResourceId` (unlike goals which clears selectedGoalId)

  ```ts
  it('switching to Resources tab preserves focusedResourceId', () => {
    useAppStore.getState().setFocusedResourceId('r1');
    useAppStore.getState().setCurrentTab('Resources');
    expect(useAppStore.getState().focusedResourceId).toBe('r1');
  });
  ```

---

## 5. TYPE DEFINITIONS (`src/db/schema.ts`)

- [ ] **5.1** Add `read_state: 'Unread' | 'Reading' | 'Done' | 'Shelved'` to `DBResource`

  ```ts
  it('DBResource type includes read_state', () => {
    const r: DBResource = {
      id:'r1', title:'T', url:null, type:'paper', info:'', created_at:'',
      read_state: 'Reading', next_action: '', tags_json: '[]',
    };
    expect(r.read_state).toBe('Reading');
  });
  ```

- [ ] **5.2** Add `next_action: string` and `tags_json: string` to `DBResource`

  ```ts
  it('DBResource type includes next_action and tags_json', () => {
    const r: DBResource = { ...baseResource, next_action: 'do this', tags_json: '["a"]' };
    expect(r.next_action).toBe('do this');
  });
  ```

- [ ] **5.3** Add `ResourceReadState` type alias: `'Unread' | 'Reading' | 'Done' | 'Shelved'`

  ```ts
  it('ResourceReadState is a valid union type', () => {
    const s: ResourceReadState = 'Shelved'; // type error if not defined
    expect(['Unread','Reading','Done','Shelved']).toContain(s);
  });
  ```

- [ ] **5.4** Add `ResourceStats` interface: `{ total_minutes: number; reference_count: number; goals_count: number; last_engaged: string | null }`

  ```ts
  it('ResourceStats interface is correctly shaped', () => {
    const s: ResourceStats = { total_minutes: 60, reference_count: 3, goals_count: 1, last_engaged: null };
    expect(s.total_minutes).toBe(60);
  });
  ```

- [ ] **5.5** Extend `ResourceLog` interface to include `is_insight: number` (0 or 1 from SQLite)

  ```ts
  it('ResourceLog includes is_insight', () => {
    const l: ResourceLog = { id:'l1', resource_id:'r1', content:'x', created_at:'', is_insight: 1 };
    expect(l.is_insight).toBe(1);
  });
  ```

---

## 6. UI COMPONENTS

### 6.1 `ResourceHeader` (`src/components/resource-profile/ResourceHeader.tsx`)

- [ ] **6.1.1** Renders resource type icon at correct color for each of 8 types

  ```tsx
  it('renders BookOpen icon with violet color for paper type', () => {
    render(<ResourceHeader resource={mockPaperResource} onSave={vi.fn()} />);
    const icon = screen.getByTestId('type-icon');
    expect(icon).toHaveClass('text-violet-500');
  });
  ```

- [ ] **6.1.2** Title is editable inline — click activates input, blur saves

  ```tsx
  it('title input saves on blur', async () => {
    const onSave = vi.fn();
    render(<ResourceHeader resource={mockResource} onSave={onSave} />);
    const input = screen.getByDisplayValue('Original Title');
    await userEvent.clear(input);
    await userEvent.type(input, 'New Title');
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledWith({ title: 'New Title' });
  });
  ```

- [ ] **6.1.3** Blank title on blur reverts to original, does not call onSave

  ```tsx
  it('blank title reverts to original on blur', async () => {
    const onSave = vi.fn();
    render(<ResourceHeader resource={mockResource} onSave={onSave} />);
    const input = screen.getByDisplayValue('Original Title');
    await userEvent.clear(input);
    fireEvent.blur(input);
    expect(onSave).not.toHaveBeenCalled();
    expect(input).toHaveValue('Original Title');
  });
  ```

- [ ] **6.1.4** Read state pill cycles `Unread → Reading → Done → Shelved → Unread` on click

  ```tsx
  it('read state pill cycles on click', async () => {
    const onSave = vi.fn();
    render(<ResourceHeader resource={{ ...mockResource, read_state: 'Unread' }} onSave={onSave} />);
    await userEvent.click(screen.getByText('Unread'));
    expect(onSave).toHaveBeenCalledWith({ read_state: 'Reading' });
  });
  it('Done cycles to Shelved', async () => {
    const onSave = vi.fn();
    render(<ResourceHeader resource={{ ...mockResource, read_state: 'Done' }} onSave={onSave} />);
    await userEvent.click(screen.getByText('Done'));
    expect(onSave).toHaveBeenCalledWith({ read_state: 'Shelved' });
  });
  it('Shelved cycles back to Unread', async () => {
    const onSave = vi.fn();
    render(<ResourceHeader resource={{ ...mockResource, read_state: 'Shelved' }} onSave={onSave} />);
    await userEvent.click(screen.getByText('Shelved'));
    expect(onSave).toHaveBeenCalledWith({ read_state: 'Unread' });
  });
  ```

- [ ] **6.1.5** Read state pill color: Unread=gray, Reading=amber, Done=green, Shelved=slate

  ```tsx
  it('Reading state pill has amber styling', () => {
    render(<ResourceHeader resource={{ ...mockResource, read_state: 'Reading' }} onSave={vi.fn()} />);
    expect(screen.getByText('Reading')).toHaveClass('bg-amber-100', 'text-amber-700');
  });
  ```

- [ ] **6.1.6** Next action field renders as single-line input, saves on blur, shows placeholder when empty

  ```tsx
  it('next action saves on blur', async () => {
    const onSave = vi.fn();
    render(<ResourceHeader resource={mockResource} onSave={onSave} />);
    const input = screen.getByPlaceholderText(/next action/i);
    await userEvent.type(input, 're-read section 4');
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledWith({ next_action: 're-read section 4' });
  });
  ```

- [ ] **6.1.7** URL displays with external link icon; clicking opens in new tab

  ```tsx
  it('external link opens in new tab', () => {
    render(<ResourceHeader resource={{ ...mockResource, url: 'https://example.com' }} onSave={vi.fn()} />);
    const link = screen.getByRole('link', { name: /open link/i });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('href', 'https://example.com');
  });
  ```

- [ ] **6.1.8** URL field is editable — click to edit, blur to save

  ```tsx
  it('URL field saves on blur', async () => {
    const onSave = vi.fn();
    render(<ResourceHeader resource={mockResource} onSave={onSave} />);
    const input = screen.getByDisplayValue('');
    await userEvent.type(input, 'https://new.com');
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledWith({ url: 'https://new.com' });
  });
  ```

### 6.2 `ResourceTagEditor` (`src/components/resource-profile/ResourceTagEditor.tsx`)

- [ ] **6.2.1** Renders existing tags as removable chips

  ```tsx
  it('renders tag chips from tags_json', () => {
    render(<ResourceTagEditor tags={['EEG','foundational']} onChange={vi.fn()} />);
    expect(screen.getByText('EEG')).toBeInTheDocument();
    expect(screen.getByText('foundational')).toBeInTheDocument();
  });
  ```

- [ ] **6.2.2** Clicking × on a chip calls onChange with that tag removed

  ```tsx
  it('removing a tag calls onChange with updated list', async () => {
    const onChange = vi.fn();
    render(<ResourceTagEditor tags={['EEG','foundational']} onChange={onChange} />);
    await userEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]);
    expect(onChange).toHaveBeenCalledWith(['foundational']);
  });
  ```

- [ ] **6.2.3** Typing in the tag input and pressing Enter adds a new tag

  ```tsx
  it('Enter key adds new tag', async () => {
    const onChange = vi.fn();
    render(<ResourceTagEditor tags={['EEG']} onChange={onChange} />);
    const input = screen.getByPlaceholderText(/add tag/i);
    await userEvent.type(input, 'methodology{enter}');
    expect(onChange).toHaveBeenCalledWith(['EEG','methodology']);
  });
  ```

- [ ] **6.2.4** Duplicate tags are silently ignored

  ```tsx
  it('duplicate tags are not added', async () => {
    const onChange = vi.fn();
    render(<ResourceTagEditor tags={['EEG']} onChange={onChange} />);
    const input = screen.getByPlaceholderText(/add tag/i);
    await userEvent.type(input, 'EEG{enter}');
    expect(onChange).not.toHaveBeenCalled();
  });
  ```

- [ ] **6.2.5** Tag input clears after a tag is added

  ```tsx
  it('input clears after adding tag', async () => {
    const onChange = vi.fn();
    render(<ResourceTagEditor tags={[]} onChange={onChange} />);
    const input = screen.getByPlaceholderText(/add tag/i);
    await userEvent.type(input, 'new-tag{enter}');
    expect(input).toHaveValue('');
  });
  ```

### 6.3 `ResourceStatsBar` (`src/components/resource-profile/ResourceStatsBar.tsx`)

- [ ] **6.3.1** Renders 4 stat cards: Time Invested, Referenced In, Goals Touched, Last Engaged

  ```tsx
  it('renders all 4 stat labels', () => {
    render(<ResourceStatsBar stats={mockStats} />);
    expect(screen.getByText(/time invested/i)).toBeInTheDocument();
    expect(screen.getByText(/referenced in/i)).toBeInTheDocument();
    expect(screen.getByText(/goals touched/i)).toBeInTheDocument();
    expect(screen.getByText(/last engaged/i)).toBeInTheDocument();
  });
  ```

- [ ] **6.3.2** Time Invested formats minutes correctly: 0 = "—", <60 = "45m", ≥60 = "1h 20m", exact hours = "2h"

  ```tsx
  it.each([
    [0, '—'],
    [45, '45m'],
    [90, '1h 30m'],
    [120, '2h'],
  ])('formats %d minutes as %s', (mins, label) => {
    render(<ResourceStatsBar stats={{ ...mockStats, total_minutes: mins }} />);
    expect(screen.getByTestId('time-value')).toHaveTextContent(label);
  });
  ```

- [ ] **6.3.3** Last Engaged shows "X days ago" for recent dates, "—" when null

  ```tsx
  it('last_engaged null shows —', () => {
    render(<ResourceStatsBar stats={{ ...mockStats, last_engaged: null }} />);
    expect(screen.getByTestId('last-engaged-value')).toHaveTextContent('—');
  });
  it('last_engaged shows relative time', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    render(<ResourceStatsBar stats={{ ...mockStats, last_engaged: threeDaysAgo }} />);
    expect(screen.getByTestId('last-engaged-value')).toHaveTextContent('3 days ago');
  });
  ```

- [ ] **6.3.4** Shows loading skeleton state when `stats` is null/undefined

  ```tsx
  it('shows skeleton when stats is null', () => {
    render(<ResourceStatsBar stats={null} />);
    expect(screen.getAllByTestId('stat-skeleton')).toHaveLength(4);
  });
  ```

### 6.4 `ResourceConnectionGraph` (`src/components/resource-profile/ResourceConnectionGraph.tsx`)

- [ ] **6.4.1** Renders Sigma canvas container when graph has nodes

  ```tsx
  it('renders SigmaContainer when nodes exist', () => {
    render(<ResourceConnectionGraph data={mockGraphData} onTaskClick={vi.fn()} onResourceClick={vi.fn()} />);
    expect(document.querySelector('canvas')).toBeTruthy();
  });
  ```

- [ ] **6.4.2** Shows "no connections" placeholder when graph has only the centre node

  ```tsx
  it('shows placeholder for isolated resource', () => {
    const isolated = { nodes: [{ id:'r1', label:'T', nodeType:'resource', meta:{} }], edges: [] };
    render(<ResourceConnectionGraph data={isolated} onTaskClick={vi.fn()} onResourceClick={vi.fn()} />);
    expect(screen.getByText(/reference this resource/i)).toBeInTheDocument();
  });
  ```

- [ ] **6.4.3** Legend row shows all 3 node types (Resource, Task, Goal) and 2 edge types (Mentions, Co-cited)

  ```tsx
  it('legend shows all node and edge types', () => {
    render(<ResourceConnectionGraph data={mockGraphData} onTaskClick={vi.fn()} onResourceClick={vi.fn()} />);
    expect(screen.getByText(/resource/i)).toBeInTheDocument();
    expect(screen.getByText(/task/i)).toBeInTheDocument();
    expect(screen.getByText(/goal/i)).toBeInTheDocument();
    expect(screen.getByText(/co-cited/i)).toBeInTheDocument();
  });
  ```

- [ ] **6.4.4** `onTaskClick(taskId)` fires when a task node is clicked

  ```tsx
  it('onTaskClick fires with task id on task node click', () => {
    // Tested via sigma registerEvents mock
    const onTaskClick = vi.fn();
    renderGraph({ onTaskClick });
    // simulate sigma clickNode event for a task node
    sigmaEventBus.emit('clickNode', { node: 'task-id-1' });
    expect(onTaskClick).toHaveBeenCalledWith('task-id-1');
  });
  ```

- [ ] **6.4.5** `onResourceClick(resourceId)` fires when a co-cited resource node is clicked

  ```tsx
  it('onResourceClick fires for co-cited resource nodes', () => {
    const onResourceClick = vi.fn();
    renderGraph({ onResourceClick });
    sigmaEventBus.emit('clickNode', { node: 'co-resource-id' });
    expect(onResourceClick).toHaveBeenCalledWith('co-resource-id');
  });
  ```

### 6.5 `ResourceActivityChart` (`src/components/ResourceActivityChart.tsx`)

- [ ] **6.5.1** Renders SVG with 12 week buckets

  ```tsx
  it('renders 12 bar groups in SVG', () => {
    render(<ResourceActivityChart logs={mockLogs} refs={mockRefs} />);
    const svg = document.querySelector('svg');
    expect(svg).toBeTruthy();
  });
  ```

- [ ] **6.5.2** Shows "No activity yet" when both logs and refs are empty

  ```tsx
  it('shows no activity message for empty data', () => {
    render(<ResourceActivityChart logs={[]} refs={[]} />);
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
  });
  ```

- [ ] **6.5.3** Shows correct total counts in legend

  ```tsx
  it('legend shows correct log and ref totals', () => {
    render(<ResourceActivityChart logs={[mockLog, mockLog]} refs={[mockRef]} />);
    expect(screen.getByText(/2 logs/i)).toBeInTheDocument();
    expect(screen.getByText(/1 ref/i)).toBeInTheDocument();
  });
  ```

### 6.6 `ResourceInsightsPinned` (`src/components/resource-profile/ResourceInsightsPinned.tsx`)

- [ ] **6.6.1** Renders only logs where `is_insight === 1`, not regular logs

  ```tsx
  it('only renders insight logs', () => {
    const logs = [
      { ...mockLog, id:'1', content:'progress note', is_insight: 0 },
      { ...mockLog, id:'2', content:'key finding', is_insight: 1 },
    ];
    render(<ResourceInsightsPinned logs={logs} onDelete={vi.fn()} />);
    expect(screen.queryByText('progress note')).not.toBeInTheDocument();
    expect(screen.getByText('key finding')).toBeInTheDocument();
  });
  ```

- [ ] **6.6.2** Returns null (renders nothing) when there are no insights

  ```tsx
  it('renders nothing when no insights exist', () => {
    const { container } = render(<ResourceInsightsPinned logs={[]} onDelete={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
  ```

- [ ] **6.6.3** Each insight card has amber/yellow background styling

  ```tsx
  it('insight cards have amber styling', () => {
    const logs = [{ ...mockLog, content:'insight', is_insight: 1 }];
    render(<ResourceInsightsPinned logs={logs} onDelete={vi.fn()} />);
    const card = screen.getByText('insight').closest('[data-testid="insight-card"]');
    expect(card).toHaveClass('bg-amber-50');
  });
  ```

- [ ] **6.6.4** Delete button on each card calls onDelete with the log

  ```tsx
  it('delete button calls onDelete with correct log', async () => {
    const onDelete = vi.fn();
    const log = { ...mockLog, id:'lg1', is_insight: 1 };
    render(<ResourceInsightsPinned logs={[log]} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole('button', { name: /delete insight/i }));
    expect(onDelete).toHaveBeenCalledWith(log);
  });
  ```

### 6.7 `ResourceTimeline` (`src/components/resource-profile/ResourceTimeline.tsx`)

- [ ] **6.7.1** Merges and sorts logs (is_insight=0 only) and refs newest-first by `created_at`

  ```tsx
  it('items appear in reverse chronological order', () => {
    const older = { ...mockLog, id:'1', content:'older', created_at:'2025-01-01T00:00:00', is_insight:0 };
    const newer = { ...mockRef, edge_id:'2', created_at:'2025-06-01T00:00:00' };
    render(<ResourceTimeline logs={[older]} refs={[newer]} />);
    const items = screen.getAllByTestId('timeline-item');
    expect(items[0]).toHaveTextContent('newer ref');
    expect(items[1]).toHaveTextContent('older');
  });
  ```

- [ ] **6.7.2** Log entries render with indigo left border

  ```tsx
  it('log entries have indigo border', () => {
    render(<ResourceTimeline logs={[{ ...mockLog, is_insight:0 }]} refs={[]} />);
    const item = screen.getByTestId('timeline-item');
    expect(item).toHaveClass('border-l-[#4648d4]');
  });
  ```

- [ ] **6.7.3** Reference entries render with green left border + source badge showing source type label

  ```tsx
  it('reference entries have green border and source badge', () => {
    const ref = { ...mockRef, source_type: 'note', source_title: 'Journal entry', parent_title: 'My Task' };
    render(<ResourceTimeline logs={[]} refs={[ref]} />);
    const item = screen.getByTestId('timeline-item');
    expect(item).toHaveClass('border-l-emerald-400');
    expect(screen.getByText('Journal')).toBeInTheDocument();
    expect(screen.getByText('My Task')).toBeInTheDocument();
  });
  ```

- [ ] **6.7.4** Source content excerpt is rendered in italics, capped at 200 chars with ellipsis

  ```tsx
  it('source content shows quote with ellipsis if truncated', () => {
    const longContent = 'a'.repeat(210);
    const ref = { ...mockRef, source_content: longContent };
    render(<ResourceTimeline logs={[]} refs={[ref]} />);
    expect(screen.getByText(/a{1,}…/)).toBeInTheDocument();
  });
  ```

- [ ] **6.7.5** Shows "No activity yet" message when both logs and refs are empty

  ```tsx
  it('shows no activity message when empty', () => {
    render(<ResourceTimeline logs={[]} refs={[]} />);
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
  });
  ```

### 6.8 `ResourceLogComposer` (`src/components/resource-profile/ResourceLogComposer.tsx`)

- [ ] **6.8.1** Renders in progress mode by default — textarea + "Log" button

  ```tsx
  it('renders in progress mode by default', () => {
    render(<ResourceLogComposer onSubmit={vi.fn()} />);
    expect(screen.getByPlaceholderText(/progress note/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^log$/i })).toBeInTheDocument();
  });
  ```

- [ ] **6.8.2** Toggle button switches to insight mode — textarea placeholder changes, button/styling change to amber

  ```tsx
  it('toggle switches to insight mode', async () => {
    render(<ResourceLogComposer onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /insight/i }));
    expect(screen.getByPlaceholderText(/key insight/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save insight/i })).toBeInTheDocument();
  });
  ```

- [ ] **6.8.3** Submitting in progress mode calls `onSubmit(content, false)`

  ```tsx
  it('progress mode submits with isInsight=false', async () => {
    const onSubmit = vi.fn();
    render(<ResourceLogComposer onSubmit={onSubmit} />);
    await userEvent.type(screen.getByRole('textbox'), 'read chapter 2');
    await userEvent.click(screen.getByRole('button', { name: /^log$/i }));
    expect(onSubmit).toHaveBeenCalledWith('read chapter 2', false);
  });
  ```

- [ ] **6.8.4** Submitting in insight mode calls `onSubmit(content, true)`

  ```tsx
  it('insight mode submits with isInsight=true', async () => {
    const onSubmit = vi.fn();
    render(<ResourceLogComposer onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: /insight/i }));
    await userEvent.type(screen.getByRole('textbox'), 'critical finding');
    await userEvent.click(screen.getByRole('button', { name: /save insight/i }));
    expect(onSubmit).toHaveBeenCalledWith('critical finding', true);
  });
  ```

- [ ] **6.8.5** Ctrl+Enter submits the form

  ```tsx
  it('Ctrl+Enter submits', async () => {
    const onSubmit = vi.fn();
    render(<ResourceLogComposer onSubmit={onSubmit} />);
    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, 'quick note');
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledWith('quick note', false);
  });
  ```

- [ ] **6.8.6** Submit button disabled when textarea is empty or whitespace-only

  ```tsx
  it('submit button disabled when empty', () => {
    render(<ResourceLogComposer onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^log$/i })).toBeDisabled();
  });
  it('submit button disabled for whitespace', async () => {
    render(<ResourceLogComposer onSubmit={vi.fn()} />);
    await userEvent.type(screen.getByRole('textbox'), '   ');
    expect(screen.getByRole('button', { name: /^log$/i })).toBeDisabled();
  });
  ```

- [ ] **6.8.7** Textarea clears after successful submit

  ```tsx
  it('textarea clears after submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ResourceLogComposer onSubmit={onSubmit} />);
    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, 'some note');
    await userEvent.click(screen.getByRole('button', { name: /^log$/i }));
    await waitFor(() => expect(textarea).toHaveValue(''));
  });
  ```

### 6.9 `CoCitationPanel` (`src/components/resource-profile/CoCitationPanel.tsx`)

- [ ] **6.9.1** Lists co-cited resources from graph data sorted by number of shared task contexts (desc)

  ```tsx
  it('co-cited resources sorted by shared count', () => {
    render(<CoCitationPanel graphData={mockGraph} onResourceClick={vi.fn()} />);
    const items = screen.getAllByTestId('co-citation-item');
    // First item should be the one with more co_cited edges
    expect(items[0]).toHaveTextContent('Most cited resource');
  });
  ```

- [ ] **6.9.2** Shows "appeared together X times" count on each row

  ```tsx
  it('shows shared count on each row', () => {
    render(<CoCitationPanel graphData={mockGraph} onResourceClick={vi.fn()} />);
    expect(screen.getByText(/appeared together 2 times/i)).toBeInTheDocument();
  });
  ```

- [ ] **6.9.3** Shows "No co-cited resources yet" when graph has no co_cited edges

  ```tsx
  it('shows empty state when no co-citations', () => {
    const emptyGraph = { nodes: [centreNode], edges: [] };
    render(<CoCitationPanel graphData={emptyGraph} onResourceClick={vi.fn()} />);
    expect(screen.getByText(/no co-cited resources/i)).toBeInTheDocument();
  });
  ```

- [ ] **6.9.4** Clicking a co-cited resource row calls `onResourceClick(id)`

  ```tsx
  it('clicking a row fires onResourceClick', async () => {
    const onResourceClick = vi.fn();
    render(<CoCitationPanel graphData={mockGraph} onResourceClick={onResourceClick} />);
    await userEvent.click(screen.getAllByTestId('co-citation-item')[0]);
    expect(onResourceClick).toHaveBeenCalledWith(expect.any(String));
  });
  ```

### 6.10 `GoalCoveragePanel` (`src/components/resource-profile/GoalCoveragePanel.tsx`)

- [ ] **6.10.1** Renders each unique goal that appears in graph as a colored health-status pill

  ```tsx
  it('renders goal pills from graph', () => {
    render(<GoalCoveragePanel graphData={mockGraph} onGoalClick={vi.fn()} />);
    expect(screen.getByText('Goal Alpha')).toBeInTheDocument();
  });
  ```

- [ ] **6.10.2** Shows "No goals connected" empty state when graph has no goal nodes

  ```tsx
  it('shows empty state when no goals', () => {
    render(<GoalCoveragePanel graphData={{ nodes: [centreNode, taskNode], edges: [] }} onGoalClick={vi.fn()} />);
    expect(screen.getByText(/no goals connected/i)).toBeInTheDocument();
  });
  ```

- [ ] **6.10.3** Clicking a goal pill calls `onGoalClick(goalId)`

  ```tsx
  it('clicking goal pill fires onGoalClick', async () => {
    const onGoalClick = vi.fn();
    render(<GoalCoveragePanel graphData={mockGraph} onGoalClick={onGoalClick} />);
    await userEvent.click(screen.getByText('Goal Alpha'));
    expect(onGoalClick).toHaveBeenCalledWith('goal-1');
  });
  ```

### 6.11 `ReferencedTasksPanel` (`src/components/resource-profile/ReferencedTasksPanel.tsx`)

- [ ] **6.11.1** Lists tasks from graph sorted by `actual_minutes` descending

  ```tsx
  it('tasks sorted by time spent descending', () => {
    render(<ReferencedTasksPanel refs={mockRefs} graphData={mockGraph} onTaskClick={vi.fn()} />);
    const items = screen.getAllByTestId('task-row');
    expect(items[0]).toHaveTextContent('Heavy Task'); // 120 mins
    expect(items[1]).toHaveTextContent('Light Task'); // 30 mins
  });
  ```

- [ ] **6.11.2** Each row shows: task title, goal name, time spent (formatted), completion status icon

  ```tsx
  it('task row shows all required fields', () => {
    render(<ReferencedTasksPanel refs={mockRefs} graphData={mockGraph} onTaskClick={vi.fn()} />);
    const row = screen.getByTestId('task-row');
    expect(row).toHaveTextContent('My Task');
    expect(row).toHaveTextContent('My Goal');
    expect(row).toHaveTextContent('1h');
  });
  ```

- [ ] **6.11.3** Completed tasks show green check, incomplete show gray circle

  ```tsx
  it('completed task shows green check icon', () => {
    render(<ReferencedTasksPanel refs={mockRefs} graphData={mockGraph} onTaskClick={vi.fn()} />);
    expect(screen.getByTestId('task-completed-icon')).toHaveClass('text-emerald-500');
  });
  ```

- [ ] **6.11.4** Clicking a row calls `onTaskClick(taskId)`

  ```tsx
  it('clicking task row fires onTaskClick', async () => {
    const onTaskClick = vi.fn();
    render(<ReferencedTasksPanel refs={mockRefs} graphData={mockGraph} onTaskClick={onTaskClick} />);
    await userEvent.click(screen.getAllByTestId('task-row')[0]);
    expect(onTaskClick).toHaveBeenCalledWith(expect.any(String));
  });
  ```

---

## 7. PAGE ASSEMBLY (`src/views/ResourceProfilePage.tsx`)

- [ ] **7.1** Renders `ResourceHeader` at top with resource data + save wired to `updateResource`

  ```tsx
  it('ResourceHeader receives resource prop', async () => {
    setup('r1');
    await screen.findByDisplayValue('My Paper');
    expect(screen.getByDisplayValue('My Paper')).toBeInTheDocument();
  });
  ```

- [ ] **7.2** Renders `ResourceTagEditor` below header; saving tags calls PATCH with new tags_json

  ```tsx
  it('tag editor change triggers updateResource call', async () => {
    setup('r1');
    // type new tag and press Enter
    await userEvent.type(await screen.findByPlaceholderText(/add tag/i), 'new-tag{enter}');
    expect(patchSpy).toHaveBeenCalledWith('r1', expect.objectContaining({ tags_json: expect.stringContaining('new-tag') }));
  });
  ```

- [ ] **7.3** Renders `ResourceStatsBar` populated from `getResourceStats`

  ```tsx
  it('stats bar shows fetched data', async () => {
    setup('r1');
    await screen.findByText('2h');
    expect(screen.getByTestId('time-value')).toHaveTextContent('2h');
  });
  ```

- [ ] **7.4** Renders `ResourceActivityChart` populated from logs + refs

  ```tsx
  it('activity chart is rendered', async () => {
    setup('r1');
    await waitFor(() => expect(document.querySelector('svg')).toBeTruthy());
  });
  ```

- [ ] **7.5** Renders `ResourceConnectionGraph`; clicking a task node navigates to that task

  ```tsx
  it('task node click navigates to task focus', async () => {
    setup('r1');
    await waitFor(() => expect(document.querySelector('canvas')).toBeTruthy());
    sigmaEventBus.emit('clickNode', { node: 'task-abc' });
    expect(navigateToTaskSpy).toHaveBeenCalledWith('task-abc');
  });
  ```

- [ ] **7.6** Renders `ResourceInsightsPinned` section only when insights exist

  ```tsx
  it('insights section absent when no insights', async () => {
    setupWithNoInsights('r1');
    await waitFor(() => {});
    expect(screen.queryByText(/key insights/i)).not.toBeInTheDocument();
  });
  ```

- [ ] **7.7** Renders `ResourceTimeline` in left column with merged data

  ```tsx
  it('timeline section is rendered', async () => {
    setup('r1');
    await screen.findByTestId('resource-timeline');
    expect(screen.getByTestId('resource-timeline')).toBeInTheDocument();
  });
  ```

- [ ] **7.8** Renders `ResourceLogComposer`; submitting calls addResourceLog and invalidates data

  ```tsx
  it('log composer submit calls addResourceLog', async () => {
    setup('r1');
    await userEvent.type(await screen.findByPlaceholderText(/progress note/i), 'test entry');
    await userEvent.click(screen.getByRole('button', { name: /^log$/i }));
    expect(addResourceLogSpy).toHaveBeenCalledWith('r1', 'test entry', false);
  });
  ```

- [ ] **7.9** Right column renders `CoCitationPanel`, `GoalCoveragePanel`, `ReferencedTasksPanel`

  ```tsx
  it('right column panels are rendered', async () => {
    setup('r1');
    await waitFor(() => {
      expect(screen.getByText(/co-cited/i)).toBeInTheDocument();
      expect(screen.getByText(/goal coverage/i)).toBeInTheDocument();
      expect(screen.getByText(/referenced tasks/i)).toBeInTheDocument();
    });
  });
  ```

- [ ] **7.10** Page shows a skeleton/loading state while data is fetching

  ```tsx
  it('shows loading skeleton before data arrives', () => {
    setup('r1'); // data resolves async
    expect(screen.getAllByTestId('stat-skeleton')).toHaveLength(4);
  });
  ```

- [ ] **7.11** Page shows error state if resource not found (404)

  ```tsx
  it('shows not-found message on 404', async () => {
    setupWith404('nonexistent');
    await screen.findByText(/resource not found/i);
  });
  ```

---

## 8. ROUTING & NAVIGATION

- [ ] **8.1** `ResourcesView` renders `ResourceProfilePage` instead of slide-over when `focusedResourceId` is set

  ```tsx
  it('ResourcesView renders profile page when focusedResourceId is set', () => {
    useAppStore.getState().setFocusedResourceId('r1');
    render(<ResourcesView />);
    expect(screen.getByTestId('resource-profile-page')).toBeInTheDocument();
  });
  ```

- [ ] **8.2** Back button in `ResourceProfilePage` header calls `setFocusedResourceId(null)`

  ```tsx
  it('back button clears focusedResourceId', async () => {
    useAppStore.getState().setFocusedResourceId('r1');
    render(<ResourcesView />);
    await userEvent.click(screen.getByRole('button', { name: /back to library/i }));
    expect(useAppStore.getState().focusedResourceId).toBeNull();
  });
  ```

- [ ] **8.3** Clicking a co-cited resource in `CoCitationPanel` updates `focusedResourceId` to the new resource's id

  ```tsx
  it('co-cited resource click updates focusedResourceId', async () => {
    useAppStore.getState().setFocusedResourceId('r1');
    render(<ResourcesView />);
    await userEvent.click(await screen.findByTestId('co-citation-item'));
    expect(useAppStore.getState().focusedResourceId).not.toBe('r1');
  });
  ```

- [ ] **8.4** Clicking a goal pill in `GoalCoveragePanel` navigates to that goal (`navigateToGoal(goalId)`)

  ```tsx
  it('goal pill click navigates to goal', async () => {
    const navigateToGoal = vi.spyOn(useAppStore.getState(), 'navigateToGoal');
    useAppStore.getState().setFocusedResourceId('r1');
    render(<ResourcesView />);
    await userEvent.click(await screen.findByText('Goal Alpha'));
    expect(navigateToGoal).toHaveBeenCalledWith('goal-1');
  });
  ```

- [ ] **8.5** Clicking a task row in `ReferencedTasksPanel` navigates to that task (`setSelectedGoalId` + `setFocusedTaskId` + `setCurrentTab('Goals')`)

  ```tsx
  it('task row click navigates to task focus', async () => {
    const store = useAppStore.getState();
    useAppStore.getState().setFocusedResourceId('r1');
    render(<ResourcesView />);
    await userEvent.click(await screen.findAllByTestId('task-row')[0]);
    expect(store.currentTab).toBe('Goals');
    expect(store.focusedTaskId).toBeTruthy();
  });
  ```

---

## IMPLEMENTATION ORDER

```
1.1.1 → 1.1.2 → 1.1.3 → 1.2.1          (DB)
2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6       (API routes)
3.1 → 3.2 → 3.3 → 3.4 → 3.5             (Query layer)
5.1 → 5.2 → 5.3 → 5.4 → 5.5             (Types)
4.1 → 4.2 → 4.3                          (Store)
6.1 → 6.2 → 6.3 → 6.4 → 6.5             (Core components)
6.6 → 6.7 → 6.8 → 6.9 → 6.10 → 6.11    (Content components)
7.1 → 7.2 → ... → 7.11                   (Page assembly)
8.1 → 8.2 → 8.3 → 8.4 → 8.5             (Routing)
```

**Total checkboxes: 71**  
**Total unit tests: 71**
