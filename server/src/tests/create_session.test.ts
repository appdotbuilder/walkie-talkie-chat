
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { userSessionsTable } from '../db/schema';
import { type CreateSessionInput } from '../schema';
import { createSession } from '../handlers/create_session';
import { eq } from 'drizzle-orm';

// Simple test input
const testInput: CreateSessionInput = {};

describe('createSession', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a session', async () => {
    const result = await createSession(testInput);

    // Basic field validation
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('string');
    expect(result.room_id).toBeNull();
    expect(result.is_connected).toBe(true);
    expect(result.is_speaking).toBe(false);
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save session to database', async () => {
    const result = await createSession(testInput);

    // Query using proper drizzle syntax
    const sessions = await db.select()
      .from(userSessionsTable)
      .where(eq(userSessionsTable.id, result.id))
      .execute();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toEqual(result.id);
    expect(sessions[0].room_id).toBeNull();
    expect(sessions[0].is_connected).toBe(true);
    expect(sessions[0].is_speaking).toBe(false);
    expect(sessions[0].created_at).toBeInstanceOf(Date);
    expect(sessions[0].updated_at).toBeInstanceOf(Date);
  });

  it('should create unique session IDs', async () => {
    const result1 = await createSession(testInput);
    const result2 = await createSession(testInput);

    // Sessions should have different IDs
    expect(result1.id).not.toEqual(result2.id);

    // Both should exist in database
    const sessions = await db.select()
      .from(userSessionsTable)
      .execute();

    expect(sessions).toHaveLength(2);
    const sessionIds = sessions.map(s => s.id);
    expect(sessionIds).toContain(result1.id);
    expect(sessionIds).toContain(result2.id);
  });
});
