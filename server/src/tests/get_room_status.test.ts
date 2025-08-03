
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { roomsTable, userSessionsTable } from '../db/schema';
import { getRoomStatus } from '../handlers/get_room_status';
import { nanoid } from 'nanoid';
import { eq, sql } from 'drizzle-orm';

describe('getRoomStatus', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return null room and partner when session does not exist', async () => {
    const result = await getRoomStatus('nonexistent-session');

    expect(result.room).toBeNull();
    expect(result.partner).toBeNull();
  });

  it('should return null room and partner when session exists but not in a room', async () => {
    // Create a session without a room
    const sessionId = nanoid();
    await db.insert(userSessionsTable)
      .values({
        id: sessionId,
        room_id: null,
        is_connected: true,
        is_speaking: false
      })
      .execute();

    const result = await getRoomStatus(sessionId);

    expect(result.room).toBeNull();
    expect(result.partner).toBeNull();
  });

  it('should return room details when session is in a room but no partner', async () => {
    // Create a room
    const roomId = nanoid();
    await db.insert(roomsTable)
      .values({
        id: roomId,
        is_active: true,
        user_count: 1
      })
      .execute();

    // Create a session in the room
    const sessionId = nanoid();
    await db.insert(userSessionsTable)
      .values({
        id: sessionId,
        room_id: roomId,
        is_connected: true,
        is_speaking: false
      })
      .execute();

    const result = await getRoomStatus(sessionId);

    expect(result.room).toBeDefined();
    expect(result.room!.id).toEqual(roomId);
    expect(result.room!.is_active).toBe(true);
    expect(result.room!.user_count).toEqual(1);
    expect(result.room!.created_at).toBeInstanceOf(Date);
    expect(result.room!.updated_at).toBeInstanceOf(Date);
    expect(result.partner).toBeNull();
  });

  it('should return room and partner details when both users are in the room', async () => {
    // Create a room
    const roomId = nanoid();
    await db.insert(roomsTable)
      .values({
        id: roomId,
        is_active: true,
        user_count: 2
      })
      .execute();

    // Create first session (the one we're querying for)
    const sessionId1 = nanoid();
    await db.insert(userSessionsTable)
      .values({
        id: sessionId1,
        room_id: roomId,
        is_connected: true,
        is_speaking: false
      })
      .execute();

    // Create second session (the partner)
    const sessionId2 = nanoid();
    await db.insert(userSessionsTable)
      .values({
        id: sessionId2,
        room_id: roomId,
        is_connected: true,
        is_speaking: true
      })
      .execute();

    const result = await getRoomStatus(sessionId1);

    expect(result.room).toBeDefined();
    expect(result.room!.id).toEqual(roomId);
    expect(result.room!.user_count).toEqual(2);
    
    expect(result.partner).toBeDefined();
    expect(result.partner!.id).toEqual(sessionId2);
    expect(result.partner!.room_id).toEqual(roomId);
    expect(result.partner!.is_connected).toBe(true);
    expect(result.partner!.is_speaking).toBe(true);
    expect(result.partner!.created_at).toBeInstanceOf(Date);
    expect(result.partner!.updated_at).toBeInstanceOf(Date);
  });

  it('should not return disconnected partners', async () => {
    // Create a room
    const roomId = nanoid();
    await db.insert(roomsTable)
      .values({
        id: roomId,
        is_active: true,
        user_count: 2
      })
      .execute();

    // Create first session (the one we're querying for)
    const sessionId1 = nanoid();
    await db.insert(userSessionsTable)
      .values({
        id: sessionId1,
        room_id: roomId,
        is_connected: true,
        is_speaking: false
      })
      .execute();

    // Create second session (disconnected partner)
    const sessionId2 = nanoid();
    await db.insert(userSessionsTable)
      .values({
        id: sessionId2,
        room_id: roomId,
        is_connected: false, // Disconnected
        is_speaking: false
      })
      .execute();

    const result = await getRoomStatus(sessionId1);

    expect(result.room).toBeDefined();
    expect(result.room!.id).toEqual(roomId);
    expect(result.partner).toBeNull(); // Should not find disconnected partner
  });

  it('should handle room that no longer exists', async () => {
    // Create a room first
    const roomId = nanoid();
    await db.insert(roomsTable)
      .values({
        id: roomId,
        is_active: true,
        user_count: 1
      })
      .execute();

    // Create a session in that room
    const sessionId = nanoid();
    await db.insert(userSessionsTable)
      .values({
        id: sessionId,
        room_id: roomId,
        is_connected: true,
        is_speaking: false
      })
      .execute();

    // Temporarily disable foreign key constraints, delete the room, then re-enable
    await db.execute(sql`SET session_replication_role = replica`);
    
    await db.delete(roomsTable)
      .where(eq(roomsTable.id, roomId))
      .execute();
    
    await db.execute(sql`SET session_replication_role = DEFAULT`);

    const result = await getRoomStatus(sessionId);

    expect(result.room).toBeNull();
    expect(result.partner).toBeNull();
  });
});
