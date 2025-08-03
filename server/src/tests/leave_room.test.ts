
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { roomsTable, userSessionsTable } from '../db/schema';
import { type LeaveRoomInput } from '../schema';
import { leaveRoom } from '../handlers/leave_room';
import { eq } from 'drizzle-orm';

describe('leaveRoom', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should remove user from room and update room user count', async () => {
    // Create a room with 2 users
    const roomId = 'room-1';
    await db.insert(roomsTable)
      .values({
        id: roomId,
        is_active: true,
        user_count: 2
      })
      .execute();

    // Create user session in the room
    const sessionId = 'session-1';
    await db.insert(userSessionsTable)
      .values({
        id: sessionId,
        room_id: roomId,
        is_connected: true,
        is_speaking: true
      })
      .execute();

    const input: LeaveRoomInput = {
      session_id: sessionId
    };

    const result = await leaveRoom(input);

    expect(result.success).toBe(true);

    // Verify user session is updated
    const updatedSession = await db.select()
      .from(userSessionsTable)
      .where(eq(userSessionsTable.id, sessionId))
      .execute();

    expect(updatedSession[0].room_id).toBeNull();
    expect(updatedSession[0].is_speaking).toBe(false);
    expect(updatedSession[0].updated_at).toBeInstanceOf(Date);

    // Verify room user count is decremented
    const updatedRoom = await db.select()
      .from(roomsTable)
      .where(eq(roomsTable.id, roomId))
      .execute();

    expect(updatedRoom[0].user_count).toBe(1);
    expect(updatedRoom[0].is_active).toBe(true); // Still active with 1 user
    expect(updatedRoom[0].updated_at).toBeInstanceOf(Date);
  });

  it('should deactivate room when last user leaves', async () => {
    // Create a room with 1 user
    const roomId = 'room-1';
    await db.insert(roomsTable)
      .values({
        id: roomId,
        is_active: true,
        user_count: 1
      })
      .execute();

    // Create user session in the room
    const sessionId = 'session-1';
    await db.insert(userSessionsTable)
      .values({
        id: sessionId,
        room_id: roomId,
        is_connected: true,
        is_speaking: false
      })
      .execute();

    const input: LeaveRoomInput = {
      session_id: sessionId
    };

    const result = await leaveRoom(input);

    expect(result.success).toBe(true);

    // Verify room is deactivated
    const updatedRoom = await db.select()
      .from(roomsTable)
      .where(eq(roomsTable.id, roomId))
      .execute();

    expect(updatedRoom[0].user_count).toBe(0);
    expect(updatedRoom[0].is_active).toBe(false);
  });

  it('should succeed when user is not in any room', async () => {
    // Create user session without room
    const sessionId = 'session-1';
    await db.insert(userSessionsTable)
      .values({
        id: sessionId,
        room_id: null,
        is_connected: true,
        is_speaking: false
      })
      .execute();

    const input: LeaveRoomInput = {
      session_id: sessionId
    };

    const result = await leaveRoom(input);

    expect(result.success).toBe(true);

    // Verify session unchanged
    const session = await db.select()
      .from(userSessionsTable)
      .where(eq(userSessionsTable.id, sessionId))
      .execute();

    expect(session[0].room_id).toBeNull();
    expect(session[0].is_speaking).toBe(false);
  });

  it('should handle user count not going below zero', async () => {
    // Create a room with user count already at 0 (edge case)
    const roomId = 'room-1';
    await db.insert(roomsTable)
      .values({
        id: roomId,
        is_active: false,
        user_count: 0
      })
      .execute();

    // Create user session somehow associated with the room
    const sessionId = 'session-1';
    await db.insert(userSessionsTable)
      .values({
        id: sessionId,
        room_id: roomId,
        is_connected: true,
        is_speaking: false
      })
      .execute();

    const input: LeaveRoomInput = {
      session_id: sessionId
    };

    const result = await leaveRoom(input);

    expect(result.success).toBe(true);

    // Verify room user count stays at 0
    const updatedRoom = await db.select()
      .from(roomsTable)
      .where(eq(roomsTable.id, roomId))
      .execute();

    expect(updatedRoom[0].user_count).toBe(0);
    expect(updatedRoom[0].is_active).toBe(false);
  });

  it('should throw error when user session does not exist', async () => {
    const input: LeaveRoomInput = {
      session_id: 'nonexistent-session'
    };

    expect(async () => {
      await leaveRoom(input);
    }).toThrow(/User session not found/i);
  });
});
