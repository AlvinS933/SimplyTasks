import * as SQLite from 'expo-sqlite';
 
let dbPromise = null;
 
// New filename -> forces a fresh SQLite file, so the old lab-notebook
// data is left behind untouched (and unused) rather than migrated.
function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('todolist.db');
  }
  return dbPromise;
}
 
export async function initDatabase() {
  const db = await getDb();
 
  // synced: 0 = pending (created/edited locally, not yet pushed to a server)
  //         1 = synced (matches server state)
  // Same pattern as before — tracked per-row now so a future sync phase
  // already has a way to know what still needs to go out.
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
 
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      notes TEXT,
      due_date INTEGER,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0
    );
  `);
}
 
function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
 
export async function createTask({ title, notes, dueDate }) {
  const db = await getDb();
  const now = Date.now();
  const id = makeId();
 
  await db.runAsync(
    `INSERT INTO tasks (id, title, notes, due_date, completed, created_at, updated_at, synced)
     VALUES (?, ?, ?, ?, 0, ?, ?, 0)`,
    [id, title, notes ?? '', dueDate ?? null, now, now]
  );
 
  return id;
}
 
export async function getAllTasks() {
  const db = await getDb();
  // Incomplete tasks first, newest first within each group.
  return db.getAllAsync(
    `SELECT * FROM tasks ORDER BY completed ASC, created_at DESC`
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
  await db.runAsync(`DELETE FROM tasks WHERE id = ?`, [id]);
}

export async function deleteAllTasks() {
  const db = await getDb();
  await db.runAsync(`DELETE FROM tasks`);
}
 