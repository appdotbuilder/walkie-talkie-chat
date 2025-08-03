
import { db } from '../db';
import { roomsTable, userSessionsTable } from '../db/schema';
import { type JoinRoomInput, type Room } from '../schema';
import { eq, and, lt } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export const joinRoom = async (input: JoinRoomInput): Promise<Room> => {
  try {
    // First, verify the session exists
    const session = await db.select()
      .from(userSessionsTable)
      .where(eq(userSessionsTable.id, input.session_id))
      .execute();

    if (session.length === 0) {
      throw new Error('Session not found');
    }

    const userSession = session[0];

    // If user is already in a room, leave it first
    if (userSession.room_id) {
      await db.execute(
        sql`UPDATE ${roomsTable} SET user_count = user_count - 1, updated_at = NOW() WHERE id = ${userSession.room_id}`
      );
    }

    let targetRoom: Room;

    if (input.room_id) {
      // Try to join specific room
      const rooms = await db.select()
        .from(roomsTable)
        .where(and(
          eq(roomsTable.id, input.room_id),
          eq(roomsTable.is_active, true),
          lt(roomsTable.user_count, 2)
        ))
        .execute();

      if (rooms.length === 0) {
        throw new Error('Room not found, inactive, or full');
      }
      targetRoom = rooms[0];
    } else {
      // Find available room or create new one
      const availableRooms = await db.select()
        .from(roomsTable)
        .where(and(
          eq(roomsTable.is_active, true),
          lt(roomsTable.user_count, 2)
        ))
        .limit(1)
        .execute();

      if (availableRooms.length > 0) {
        targetRoom = availableRooms[0];
      } else {
        // Create new room
        const newRooms = await db.insert(roomsTable)
          .values({
            id: `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            user_count: 0
          })
          .returning()
          .execute();
        targetRoom = newRooms[0];
      }
    }

    // Update user session to join the room
    await db.update(userSessionsTable)
      .set({
        room_id: targetRoom.id,
        updated_at: new Date()
      })
      .where(eq(userSessionsTable.id, input.session_id))
      .execute();

    // Increment room user count
    const updatedRooms = await db.update(roomsTable)
      .set({
        user_count: sql`user_count + 1`,
        updated_at: new Date()
      })
      .where(eq(roomsTable.id, targetRoom.id))
      .returning()
      .execute();

    return updatedRooms[0];
  } catch (error) {
    console.error('Join room failed:', error);
    throw error;
  }
};
