import { supabase, isSupabaseConfigured } from './supabase';
import * as db from '../db/database';

// One sync at a time. If a sync is requested while one is running, we skip it
// (the running one will pick up current state, or the next trigger will).
let syncing = false;

/**
 * Push local changes, then pull remote ones. Offline-first: the UI always
 * reads from SQLite; this just keeps SQLite and Postgres in step in the
 * background. Any network/auth failure is swallowed — local edits stay
 * `synced = 0` and get retried on the next sync.
 */
export async function syncNow(userId) {
  if (!userId || !isSupabaseConfigured || syncing) return;
  syncing = true;
  try {
    await pushChanges();
    await pullChanges();
  } catch (e) {
    if (__DEV__) console.log('[sync] skipped/failed:', e.message);
  } finally {
    syncing = false;
  }
}

/* ------------------------------------------------------------------ */
/* Push: local (synced = 0) -> server                                  */
/* Order matters for RLS/foreign keys: lists, then members, then tasks */
/* ------------------------------------------------------------------ */

async function pushChanges() {
  const lists = await db.getUnsyncedLists();
  const { data: authData } = await supabase.auth.getUser();
  console.log('[sync] authed uid:', authData?.user?.id ?? 'NONE (anon — no valid session)');
  const dbg = await db.getUnsyncedLists();
  console.log('[sync] list owner_ids being pushed:', dbg.map((l) => l.owner_id));
  if (lists.length) {
    const { error } = await supabase.from('lists').upsert(lists.map(toServerList));
    if (error) throw error;
    await db.markListsSynced(lists.map((l) => l.id));
  }

  const members = await db.getUnsyncedMembers();
  if (members.length) {
    const { error } = await supabase.from('list_members').upsert(members.map(toServerMember));
    if (error) throw error;
    await db.markMembersSynced(members);
  }

  const tasks = await db.getUnsyncedTasks();
  if (tasks.length) {
    const { error } = await supabase.from('tasks').upsert(tasks.map(toServerTask));
    if (error) throw error;
    await db.markTasksSynced(tasks.map((t) => t.id));
  }
}

/* ------------------------------------------------------------------ */
/* Pull: server -> local. Full pulls (data is tiny), so newly-shared    */
/* lists and their existing tasks always arrive regardless of age.      */
/* RLS scopes every SELECT to lists the user belongs to.                */
/* ------------------------------------------------------------------ */

async function pullChanges() {
  const { data: lists, error: le } = await supabase.from('lists').select('*');
  if (le) throw le;
  for (const r of lists) await db.applyRemoteList(fromServerList(r));

  const { data: members, error: me } = await supabase.from('list_members').select('*');
  if (me) throw me;
  for (const m of members) await db.applyRemoteMember(m);

  const { data: tasks, error: te } = await supabase.from('tasks').select('*');
  if (te) throw te;
  for (const t of tasks) await db.applyRemoteTask(fromServerTask(t));

  // Cache the profiles of everyone who shares a list with the user, so member
  // lists can show names/emails offline.
  const ids = [...new Set(members.map((m) => m.user_id))];
  if (ids.length) {
    const { data: profiles, error: pe } = await supabase
      .from('profiles')
      .select('*')
      .in('id', ids);
    if (pe) throw pe;
    for (const p of profiles) await db.upsertProfile(p);
  }
}

/**
 * Share a list with another user, looked up by email against the server
 * `profiles` table (so you can share with anyone who has an account, not just
 * people on this device). Requires a network connection.
 */
export async function shareList(listId, email, userId) {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' };
  const clean = email.trim().toLowerCase();

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', clean)
    .limit(1);
  if (error) return { ok: false, reason: 'error', error };
  if (!profiles || profiles.length === 0) return { ok: false, reason: 'not_found' };

  const target = profiles[0];
  const { inserted } = await db.addMember({ listId, userId: target.id });
  await db.upsertProfile(target);
  if (!inserted) return { ok: false, reason: 'already_member' };

  // Push the new membership right away so the invitee sees it on their next sync.
  await syncNow(userId);
  return { ok: true, user: target };
}

/* ------------------------------------------------------------------ */
/* Mapping between local (SQLite, 0/1 ints) and server (boolean) rows   */
/* ------------------------------------------------------------------ */

function toServerList(l) {
  return {
    id: l.id,
    name: l.name,
    owner_id: l.owner_id,
    created_at: l.created_at,
    updated_at: l.updated_at,
    deleted: !!l.deleted,
  };
}

function fromServerList(r) {
  return {
    id: r.id,
    name: r.name,
    owner_id: r.owner_id,
    created_at: Number(r.created_at),
    updated_at: Number(r.updated_at),
    deleted: r.deleted ? 1 : 0,
  };
}

function toServerMember(m) {
  return { list_id: m.list_id, user_id: m.user_id, role: m.role, created_at: m.created_at };
}

function toServerTask(t) {
  return {
    id: t.id,
    list_id: t.list_id,
    title: t.title,
    notes: t.notes ?? null,
    due_date: t.due_date ?? null,
    completed: !!t.completed,
    created_at: t.created_at,
    updated_at: t.updated_at,
    deleted: !!t.deleted,
  };
}

function fromServerTask(r) {
  return {
    id: r.id,
    list_id: r.list_id,
    title: r.title,
    notes: r.notes ?? '',
    due_date: r.due_date != null ? Number(r.due_date) : null,
    completed: r.completed ? 1 : 0,
    created_at: Number(r.created_at),
    updated_at: Number(r.updated_at),
    deleted: r.deleted ? 1 : 0,
  };
}
