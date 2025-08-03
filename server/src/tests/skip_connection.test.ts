
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { roomsTable, userSessionsTable } from '../db/schema';
import { type SkipConnectionInput } from '../schema';
import { skipConnection } from '../handlers/skip_connection';
import { eq } from 'drizzle-orm';

function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

describe('skipConnection', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  const createTestSession = async (roomId?: string) => {
    const sessionId = generateId();
    await db.insert(userSessionsTable)
      .values({
        id: sessionId,
        room_id: roomId || null,
        created_at: new Date(),
        updated_at: new Date(),
        is_connected: true,
        is_speaking: false
      })
      .execute();
    return sessionId;
  };

  const createTestRoom = async (userCount: number = 0) => {
    const roomId = generateId();
    await db.insert(roomsTable)
      .values({
        id: roomId,
        created_at: new Date(),
        updated_at: new Date(),
        is_active: true,
        user_count: userCount
      })
      .execute();
    return roomId;
  };

  it('should create new room when no available rooms exist', async () => {
    const sessionId = await createTestSession();
    const input: SkipConnectionInput = { session_id: sessionId };

    const result = await skipConnection(input);

    expect(result.id).toBeDefined();
    expect(result.is_active).toBe(true);
    expect(result.user_count).toBe(1);
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);

    // Verify session was updated
    const sessions = await db.select()
      .from(userSessionsTable)
      .where(eq(userSessionsTable.id, sessionId))
      .execute();

    expect(sessions[0].room_id).toBe(result.id);
  });

  it('should join existing available room when one exists', async () => {
    const sessionId = await createTestSession();
    const existingRoomId = await createTestRoom(1); // Room with 1 user
    
    const input: SkipConnectionInput = { session_id: sessionId };

    const result = await skipConnection(input);

    expect(result.id).toBe(existingRoomId);
    expect(result.user_count).toBe(2);

    // Verify session was updated to join existing room
    const sessions = await db.select()
      .from(userSessionsTable)
      .where(eq(userSessionsTable.id, sessionId))
      .execute();

    expect(sessions[0].room_id).toBe(existingRoomId);
  });

  it('should leave current room before finding new one', async () => {
    const currentRoomId = await createTestRoom(2); // Full room
    const sessionId = await createTestSession(currentRoomId);
    const availableRoomId = await createTestRoom(1); // Available room

    const input: SkipConnectionInput = { session_id: sessionId };

    const result = await skipConnection(input);

    // Should join the available room, not the current one
    expect(result.id).toBe(availableRoomId);
    expect(result.user_count).toBe(2);

    // Verify old room user count was decreased
    const oldRooms = await db.select()
      .from(roomsTable)
      .where(eq(roomsTable.id, currentRoomId))
      .execute();

    expect(oldRooms[0].user_count).toBe(0);

    // Verify session was moved to new room
    const sessions = await db.select()
      .from(userSessionsTable)
      .where(eq(userSessionsTable.id, sessionId))
      .execute();

    expect(sessions[0].room_id).toBe(availableRoomId);
  });

  it('should handle session not in any room', async () => {
    const sessionId = await createTestSession(); // No room assigned
    const availableRoomId = await createTestRoom(1);

    const input: SkipConnectionInput = { session_id: sessionId };

    const result = await skipConnection(input);

    expect(result.id).toBe(availableRoomId);
    expect(result.user_count).toBe(2);

    // Verify session joined the available room
    const sessions = await db.select()
      .from(userSessionsTable)
      .where(eq(userSessionsTable.id, sessionId))
      .execute();

    expect(sessions[0].room_id).toBe(availableRoomId);
  });

  it('should throw error for non-existent session', async () => {
    const input: SkipConnectionInput = { session_id: 'non-existent-session' };

    await expect(skipConnection(input)).rejects.toThrow(/session not found/i);
  });

  it('should prefer available rooms over creating new ones', async () => {
    const sessionId = await createTestSession();
    const availableRoom1 = await createTestRoom(1);
    const availableRoom2 = await createTestRoom(1);

    const input: SkipConnectionInput = { session_id: sessionId };

    const result = await skipConnection(input);

    // Should join one of the available rooms (first one found)
    expect([availableRoom1, availableRoom2]).toContain(result.id);
    expect(result.user_count).toBe(2);

    // Verify only one room was updated
    const rooms = await db.select()
      .from(roomsTable)
      .where(eq(roomsTable.user_count, 2))
      .execute();

    expect(rooms).toHaveLength(1);
  });
});
