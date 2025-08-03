
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { roomsTable, userSessionsTable } from '../db/schema';
import { type JoinRoomInput } from '../schema';
import { joinRoom } from '../handlers/join_room';
import { eq } from 'drizzle-orm';

describe('joinRoom', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should join a specific room when room_id is provided', async () => {
    // Create a session
    const session = await db.insert(userSessionsTable)
      .values({
        id: 'session-1'
      })
      .returning()
      .execute();

    // Create a room with space
    const room = await db.insert(roomsTable)
      .values({
        id: 'room-1',
        user_count: 1
      })
      .returning()
      .execute();

    const input: JoinRoomInput = {
      session_id: 'session-1',
      room_id: 'room-1'
    };

    const result = await joinRoom(input);

    expect(result.id).toEqual('room-1');
    expect(result.user_count).toEqual(2);
    expect(result.is_active).toBe(true);

    // Verify session was updated
    const updatedSession = await db.select()
      .from(userSessionsTable)
      .where(eq(userSessionsTable.id, 'session-1'))
      .execute();

    expect(updatedSession[0].room_id).toEqual('room-1');
  });

  it('should find available room when room_id is not provided', async () => {
    // Create a session
    await db.insert(userSessionsTable)
      .values({
        id: 'session-1'
      })
      .returning()
      .execute();

    // Create a room with space
    await db.insert(roomsTable)
      .values({
        id: 'room-available',
        user_count: 1
      })
      .returning()
      .execute();

    const input: JoinRoomInput = {
      session_id: 'session-1'
    };

    const result = await joinRoom(input);

    expect(result.id).toEqual('room-available');
    expect(result.user_count).toEqual(2);
  });

  it('should create new room when no available rooms exist', async () => {
    // Create a session
    await db.insert(userSessionsTable)
      .values({
        id: 'session-1'
      })
      .returning()
      .execute();

    // Create a full room
    await db.insert(roomsTable)
      .values({
        id: 'room-full',
        user_count: 2
      })
      .returning()
      .execute();

    const input: JoinRoomInput = {
      session_id: 'session-1'
    };

    const result = await joinRoom(input);

    expect(result.id).toMatch(/^room-\d+-[a-z0-9]+$/);
    expect(result.user_count).toEqual(1);
    expect(result.is_active).toBe(true);
  });

  it('should leave previous room before joining new one', async () => {
    // Create the old room first
    await db.insert(roomsTable)
      .values({
        id: 'old-room',
        user_count: 1
      })
      .returning()
      .execute();

    // Create a session already in the old room
    await db.insert(userSessionsTable)
      .values({
        id: 'session-1',
        room_id: 'old-room'
      })
      .returning()
      .execute();

    // Create new room
    await db.insert(roomsTable)
      .values({
        id: 'new-room',
        user_count: 1
      })
      .returning()
      .execute();

    const input: JoinRoomInput = {
      session_id: 'session-1',
      room_id: 'new-room'
    };

    const result = await joinRoom(input);

    expect(result.id).toEqual('new-room');
    expect(result.user_count).toEqual(2);

    // Verify old room user count decreased
    const oldRoom = await db.select()
      .from(roomsTable)
      .where(eq(roomsTable.id, 'old-room'))
      .execute();

    expect(oldRoom[0].user_count).toEqual(0);
  });

  it('should throw error when session does not exist', async () => {
    const input: JoinRoomInput = {
      session_id: 'nonexistent-session'
    };

    await expect(joinRoom(input)).rejects.toThrow(/session not found/i);
  });

  it('should throw error when specific room is full', async () => {
    // Create a session
    await db.insert(userSessionsTable)
      .values({
        id: 'session-1'
      })
      .returning()
      .execute();

    // Create a full room
    await db.insert(roomsTable)
      .values({
        id: 'full-room',
        user_count: 2
      })
      .returning()
      .execute();

    const input: JoinRoomInput = {
      session_id: 'session-1',
      room_id: 'full-room'
    };

    await expect(joinRoom(input)).rejects.toThrow(/room not found, inactive, or full/i);
  });

  it('should throw error when specific room does not exist', async () => {
    // Create a session
    await db.insert(userSessionsTable)
      .values({
        id: 'session-1'
      })
      .returning()
      .execute();

    const input: JoinRoomInput = {
      session_id: 'session-1',
      room_id: 'nonexistent-room'
    };

    await expect(joinRoom(input)).rejects.toThrow(/room not found, inactive, or full/i);
  });
});
