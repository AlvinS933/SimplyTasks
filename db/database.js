import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

let dbPromise = null;

// New filename -> forces a fresh SQLite file. The previous single-table
// "tasks" database is left behind (unused) rather than migrated, since the
// multi-user / shared-list schema below is a significant redesign.
function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('simplytasks.db');
  }
  return dbPromise;
}

// Real UUIDs (instead of the old timestamp+random ids) so that when these
// rows eventually sync to Postgres the primary-key type matches exactly.
export function makeId() {
  return Crypto.randomUUID();
}

// DEV ONLY: wipes the entire local database (all users, lists, tasks, and the
// login session), then recreates the empty schema. Close the open handle first
// so WAL files are released before the delete. Call initDatabase() again — or
// just relaunch the app — after this.
export async function resetDatabase() {
  if (dbPromise) {
    const db = await dbPromise;
    await db.closeAsync();
    dbPromise = null;
  }
  await SQLite.deleteDatabaseAsync('simplytasks.db');
  await initDatabase();
}

export async function initDatabase() {
  const db = await getDb();

  // Every user-owned row carries:
  //   updated_at -> drives last-write-wins conflict resolution during a
  //                 future sync phase.
  //   deleted    -> tombstone. We never hard-delete, because a hard DELETE
  //                 can't be communicated to other devices/servers later.
  //   synced     -> 0 = local change not yet pushed, 1 = matches server.
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    -- Single-row table holding whoever is currently logged in on this device.
    -- Replaced by supabase.auth's persisted session once the backend lands.
    CREATE TABLE IF NOT EXISTS session (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      user_id TEXT
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

    -- Who can see/edit each list. Sharing = inserting a row here.
    -- role: 'owner' | 'editor' | 'viewer'
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
  `);
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

export async function insertUser({ id, email, name, passwordHash, salt }) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO users (id, email, name, password_hash, salt, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, email, name ?? null, passwordHash, salt, Date.now()]
  );
}

export async function getUserByEmail(email) {
  const db = await getDb();
  return db.getFirstAsync(`SELECT * FROM users WHERE email = ?`, [email]);
}

export async function getUserById(id) {
  const db = await getDb();
  return db.getFirstAsync(`SELECT * FROM users WHERE id = ?`, [id]);
}

/* ------------------------------------------------------------------ */
/* Session (local "who is logged in")                                  */
/* ------------------------------------------------------------------ */

export async function setSession(userId) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO session (id, user_id) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id`,
    [userId]
  );
}

export async function getSessionUserId() {
  const db = await getDb();
  const row = await db.getFirstAsync(`SELECT user_id FROM session WHERE id = 1`);
  return row?.user_id ?? null;
}

export async function clearSession() {
  const db = await getDb();
  await db.runAsync(`DELETE FROM session WHERE id = 1`);
}

/* ------------------------------------------------------------------ */
/* Lists                                                               */
/* ------------------------------------------------------------------ */

// Creates the list AND the owner's membership row in one transaction, so a
// list is never left without at least one member who can see it.
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

// Every list this user is a member of (owned or shared with them), plus a
// live count of open (incomplete, not deleted) tasks for the list card.
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

// Soft-delete the list and all of its tasks (tombstones, not real deletes).
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
  return db.getAllAsync(
    `SELECT u.id, u.email, u.name, m.role
       FROM list_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.list_id = ?
      ORDER BY m.created_at ASC`,
    [listId]
  );
}

// Shares a list with an existing local user, looked up by email. Returns a
// small result object so the UI can show a friendly message. (Pre-backend,
// you can only share with accounts that exist on this device.)
export async function shareListByEmail(listId, email, role = 'editor') {
  const db = await getDb();
  const user = await getUserByEmail(email.trim().toLowerCase());
  if (!user) return { ok: false, reason: 'not_found' };

  const existing = await db.getFirstAsync(
    `SELECT 1 FROM list_members WHERE list_id = ? AND user_id = ?`,
    [listId, user.id]
  );
  if (existing) return { ok: false, reason: 'already_member' };

  await db.runAsync(
    `INSERT INTO list_members (list_id, user_id, role, created_at, synced)
     VALUES (?, ?, ?, ?, 0)`,
    [listId, user.id, role, Date.now()]
  );
  return { ok: true, user };
}

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

export async function getTasksForList(listId) {
  const db = await getDb();
  // Incomplete first, newest first within each group; tombstones hidden.
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
