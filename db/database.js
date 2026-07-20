import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

// Bumped filename: auth moved from local accounts to Supabase Auth, so user
// ids (and therefore owner_id / member ids on old rows) are no longer valid.
// A fresh file avoids mixing the two identity models.
const DB_NAME = 'simplytasks-v2.db';

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME);
  }
  return dbPromise;
}

// Real UUIDs so local ids match the Postgres uuid primary keys exactly.
export function makeId() {
  return Crypto.randomUUID();
}

// DEV ONLY: wipes the entire local cache, then recreates the empty schema.
// This does NOT touch the server — a later sync just re-pulls everything.
export async function resetDatabase() {
  if (dbPromise) {
    const db = await dbPromise;
    await db.closeAsync();
    dbPromise = null;
  }
  await SQLite.deleteDatabaseAsync(DB_NAME);
  await initDatabase();
}

export async function initDatabase() {
  const db = await getDb();

  // Per-row sync bookkeeping:
  //   updated_at -> epoch ms; drives last-write-wins during sync.
  //   deleted    -> tombstone (never hard-delete; deletes must sync).
  //   synced     -> 0 = local change not yet pushed, 1 = matches server.
  // No users/session tables anymore: Supabase Auth owns identity and its JS
  // client persists the session in AsyncStorage. `profiles` is a local cache
  // of the server profiles table, used to show member names offline.
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT,
      name TEXT
    );

    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      synced INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS list_members (
      list_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'editor',
      created_at INTEGER NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (list_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY NOT NULL,
      list_id TEXT NOT NULL,
      title TEXT NOT NULL,
      notes TEXT,
      due_date INTEGER,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      synced INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks (list_id);
    CREATE INDEX IF NOT EXISTS idx_members_user ON list_members (user_id);
    CREATE INDEX IF NOT EXISTS idx_lists_synced ON lists (synced);
    CREATE INDEX IF NOT EXISTS idx_tasks_synced ON tasks (synced);
    CREATE INDEX IF NOT EXISTS idx_members_synced ON list_members (synced);
  `);
}

/* ------------------------------------------------------------------ */
/* Profiles (local cache of the server profiles table)                 */
/* ------------------------------------------------------------------ */

export async function upsertProfile({ id, email, name }) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO profiles (id, email, name) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name`,
    [id, email ?? null, name ?? null]
  );
}

/* ------------------------------------------------------------------ */
/* Lists                                                               */
/* ------------------------------------------------------------------ */

// Creates the list AND the owner's membership row in one transaction, so a
// list is never left without a member who can see it.
export async function createList({ name, ownerId }) {
  const db = await getDb();
  const id = makeId();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO lists (id, name, owner_id, created_at, updated_at, deleted, synced)
       VALUES (?, ?, ?, ?, ?, 0, 0)`,
      [id, name, ownerId, now, now]
    );
    await db.runAsync(
      `INSERT INTO list_members (list_id, user_id, role, created_at, synced)
       VALUES (?, ?, 'owner', ?, 0)`,
      [id, ownerId, now]
    );
  });
  return id;
}

// Every non-deleted list this user is a member of, with a live open-task count.
export async function getListsForUser(userId) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT l.*,
            (SELECT COUNT(*) FROM tasks t
              WHERE t.list_id = l.id AND t.deleted = 0 AND t.completed = 0) AS open_count,
            m.role AS role
       FROM lists l
       JOIN list_members m ON m.list_id = l.id
      WHERE m.user_id = ? AND l.deleted = 0
      ORDER BY l.updated_at DESC`,
    [userId]
  );
}

export async function renameList(id, name) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE lists SET name = ?, updated_at = ?, synced = 0 WHERE id = ?`,
    [name, Date.now(), id]
  );
}

// Soft-delete the list and all of its tasks (tombstones, not hard deletes).
export async function deleteList(id) {
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE lists SET deleted = 1, updated_at = ?, synced = 0 WHERE id = ?`,
      [now, id]
    );
    await db.runAsync(
      `UPDATE tasks SET deleted = 1, updated_at = ?, synced = 0 WHERE list_id = ?`,
      [now, id]
    );
  });
}

/* ------------------------------------------------------------------ */
/* Membership / sharing                                                */
/* ------------------------------------------------------------------ */

export async function getMembersForList(listId) {
  const db = await getDb();
  // LEFT JOIN so a member still shows even if their profile isn't cached yet.
  return db.getAllAsync(
    `SELECT m.user_id AS id, p.email, p.name, m.role
       FROM list_members m
       LEFT JOIN profiles p ON p.id = m.user_id
      WHERE m.list_id = ?
      ORDER BY m.created_at ASC`,
    [listId]
  );
}

// Adds a membership row (unsynced). Returns whether it was newly inserted so
// callers can message "already shared" vs. "shared".
export async function addMember({ listId, userId, role = 'editor' }) {
  const db = await getDb();
  const existing = await db.getFirstAsync(
    `SELECT 1 FROM list_members WHERE list_id = ? AND user_id = ?`,
    [listId, userId]
  );
  if (existing) return { inserted: false };
  await db.runAsync(
    `INSERT INTO list_members (list_id, user_id, role, created_at, synced)
     VALUES (?, ?, ?, ?, 0)`,
    [listId, userId, role, Date.now()]
  );
  return { inserted: true };
}

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

export async function getTasksForList(listId) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT * FROM tasks
      WHERE list_id = ? AND deleted = 0
      ORDER BY completed ASC, created_at DESC`,
    [listId]
  );
}

export async function createTask({ listId, title, notes, dueDate }) {
  const db = await getDb();
  const now = Date.now();
  const id = makeId();
  await db.runAsync(
    `INSERT INTO tasks (id, list_id, title, notes, due_date, completed, created_at, updated_at, deleted, synced)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, 0, 0)`,
    [id, listId, title, notes ?? '', dueDate ?? null, now, now]
  );
  return id;
}

export async function updateTask(id, { title, notes, dueDate }) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE tasks SET title = ?, notes = ?, due_date = ?, updated_at = ?, synced = 0 WHERE id = ?`,
    [title, notes ?? '', dueDate ?? null, Date.now(), id]
  );
}

export async function toggleTaskComplete(id, completed) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE tasks SET completed = ?, updated_at = ?, synced = 0 WHERE id = ?`,
    [completed ? 1 : 0, Date.now(), id]
  );
}

export async function deleteTask(id) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE tasks SET deleted = 1, updated_at = ?, synced = 0 WHERE id = ?`,
    [Date.now(), id]
  );
}

export async function deleteAllTasksInList(listId) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE tasks SET deleted = 1, updated_at = ?, synced = 0 WHERE list_id = ? AND deleted = 0`,
    [Date.now(), listId]
  );
}

/* ================================================================== */
/* Sync support                                                        */
/* ================================================================== */

/* --- Outbound: rows with local changes not yet pushed -------------- */

export async function getUnsyncedLists() {
  const db = await getDb();
  return db.getAllAsync(`SELECT * FROM lists WHERE synced = 0`);
}

export async function getUnsyncedMembers() {
  const db = await getDb();
  return db.getAllAsync(`SELECT * FROM list_members WHERE synced = 0`);
}

export async function getUnsyncedTasks() {
  const db = await getDb();
  return db.getAllAsync(`SELECT * FROM tasks WHERE synced = 0`);
}

export async function markListsSynced(ids) {
  const db = await getDb();
  for (const id of ids) {
    await db.runAsync(`UPDATE lists SET synced = 1 WHERE id = ?`, [id]);
  }
}

export async function markTasksSynced(ids) {
  const db = await getDb();
  for (const id of ids) {
    await db.runAsync(`UPDATE tasks SET synced = 1 WHERE id = ?`, [id]);
  }
}

export async function markMembersSynced(members) {
  const db = await getDb();
  for (const m of members) {
    await db.runAsync(
      `UPDATE list_members SET synced = 1 WHERE list_id = ? AND user_id = ?`,
      [m.list_id, m.user_id]
    );
  }
}

/* --- Inbound: apply a remote row locally (last-write-wins) ---------- */

// The `WHERE excluded.updated_at > lists.updated_at` guard means a remote row
// only overwrites the local one if it's genuinely newer. A local row with a
// pending (unsynced) newer edit is left alone, so it survives to be pushed.
export async function applyRemoteList(r) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO lists (id, name, owner_id, created_at, updated_at, deleted, synced)
     VALUES (?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       owner_id = excluded.owner_id,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       deleted = excluded.deleted,
       synced = 1
     WHERE excluded.updated_at > lists.updated_at`,
    [r.id, r.name, r.owner_id, r.created_at, r.updated_at, r.deleted]
  );
}

export async function applyRemoteTask(r) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO tasks (id, list_id, title, notes, due_date, completed, created_at, updated_at, deleted, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET
       list_id = excluded.list_id,
       title = excluded.title,
       notes = excluded.notes,
       due_date = excluded.due_date,
       completed = excluded.completed,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       deleted = excluded.deleted,
       synced = 1
     WHERE excluded.updated_at > tasks.updated_at`,
    [r.id, r.list_id, r.title, r.notes, r.due_date, r.completed, r.created_at, r.updated_at, r.deleted]
  );
}

// Membership has no updated_at; just take the server's role and mark synced.
export async function applyRemoteMember(r) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO list_members (list_id, user_id, role, created_at, synced)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(list_id, user_id) DO UPDATE SET role = excluded.role, synced = 1`,
    [r.list_id, r.user_id, r.role, r.created_at]
  );
}
