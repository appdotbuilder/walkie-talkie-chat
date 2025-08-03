
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { userSessionsTable, roomsTable } from '../db/schema';
import { type UpdateSpeakingStatusInput } from '../schema';
import { updateSpeakingStatus } from '../handlers/update_speaking_status';
import { eq } from 'drizzle-orm';

const testInput: UpdateSpeakingStatusInput = {
  session_id: 'test-session-123',
  is_speaking: true
};

describe('updateSpeakingStatus', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should update speaking status to true', async () => {
    // Create prerequisite room
    await db.insert(roomsTable)
      .values({
        id: 'test-room-123',
        is_active: true,
        user_count: 1
      })
      .execute();

    // Create prerequisite user session
    await db.insert(userSessionsTable)
      .values({
        id: 'test-session-123',
        room_id: 'test-room-123',
        is_connected: true,
        is_speaking: false
      })
      .execute();

    const result = await updateSpeakingStatus(testInput);

    expect(result.id).toEqual('test-session-123');
    expect(result.is_speaking).toEqual(true);
    expect(result.room_id).toEqual('test-room-123');
    expect(result.is_connected).toEqual(true);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should update speaking status to false', async () => {
    // Create prerequisite room
    await db.insert(roomsTable)
      .values({
        id: 'test-room-123',
        is_active: true,
        user_count: 1
      })
      .execute();

    // Create user session with speaking initially true
    await db.insert(userSessionsTable)
      .values({
        id: 'test-session-123',
        room_id: 'test-room-123',
        is_connected: true,
        is_speaking: true
      })
      .execute();

    const input: UpdateSpeakingStatusInput = {
      session_id: 'test-session-123',
      is_speaking: false
    };

    const result = await updateSpeakingStatus(input);

    expect(result.id).toEqual('test-session-123');
    expect(result.is_speaking).toEqual(false);
    expect(result.room_id).toEqual('test-room-123');
    expect(result.is_connected).toEqual(true);
  });

  it('should save updated speaking status to database', async () => {
    // Create prerequisite room
    await db.insert(roomsTable)
      .values({
        id: 'test-room-123',
        is_active: true,
        user_count: 1
      })
      .execute();

    // Create prerequisite user session
    await db.insert(userSessionsTable)
      .values({
        id: 'test-session-123',
        room_id: 'test-room-123',
        is_connected: true,
        is_speaking: false
      })
      .execute();

    await updateSpeakingStatus(testInput);

    // Verify in database
    const sessions = await db.select()
      .from(userSessionsTable)
      .where(eq(userSessionsTable.id, 'test-session-123'))
      .execute();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].is_speaking).toEqual(true);
    expect(sessions[0].updated_at).toBeInstanceOf(Date);
  });

  it('should throw error for non-existent session', async () => {
    const input: UpdateSpeakingStatusInput = {
      session_id: 'non-existent-session',
      is_speaking: true
    };

    expect(updateSpeakingStatus(input)).rejects.toThrow(/not found/i);
  });

  it('should update timestamp when changing speaking status', async () => {
    // Create prerequisite room
    await db.insert(roomsTable)
      .values({
        id: 'test-room-123',
        is_active: true,
        user_count: 1
      })
      .execute();

    // Create user session with old timestamp
    const oldTimestamp = new Date('2023-01-01T00:00:00Z');
    await db.insert(userSessionsTable)
      .values({
        id: 'test-session-123',
        room_id: 'test-room-123',
        is_connected: true,
        is_speaking: false,
        updated_at: oldTimestamp
      })
      .execute();

    const result = await updateSpeakingStatus(testInput);

    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.updated_at.getTime()).toBeGreaterThan(oldTimestamp.getTime());
  });
});
