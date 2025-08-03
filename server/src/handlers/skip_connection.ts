
import { db } from '../db';
import { roomsTable, userSessionsTable } from '../db/schema';
import { type SkipConnectionInput, type Room } from '../schema';
import { eq, and, lt } from 'drizzle-orm';

function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export async function skipConnection(input: SkipConnectionInput): Promise<Room> {
  try {
    // First, get the current session and room
    const currentSession = await db.select()
      .from(userSessionsTable)
      .where(eq(userSessionsTable.id, input.session_id))
      .execute();

    if (currentSession.length === 0) {
      throw new Error('Session not found');
    }

    const session = currentSession[0];
    
    // If user is in a room, leave it first
    if (session.room_id) {
      // Update session to leave current room
      await db.update(userSessionsTable)
        .set({ 
          room_id: null,
          updated_at: new Date()
        })
        .where(eq(userSessionsTable.id, input.session_id))
        .execute();

      // Decrease room user count
      await db.update(roomsTable)
        .set({ 
          user_count: 0, // Since max is 2, leaving means 0 users left
          updated_at: new Date()
        })
        .where(eq(roomsTable.id, session.room_id))
        .execute();
    }

    // Look for an available room (active room with user_count < 2)
    const availableRooms = await db.select()
      .from(roomsTable)
      .where(and(
        eq(roomsTable.is_active, true),
        lt(roomsTable.user_count, 2)
      ))
      .execute();

    let targetRoom: Room;

    if (availableRooms.length > 0) {
      // Join an existing available room
      const room = availableRooms[0];
      
      // Update room user count
      await db.update(roomsTable)
        .set({ 
          user_count: room.user_count + 1,
          updated_at: new Date()
        })
        .where(eq(roomsTable.id, room.id))
        .execute();

      // Update session to join the room
      await db.update(userSessionsTable)
        .set({ 
          room_id: room.id,
          updated_at: new Date()
        })
        .where(eq(userSessionsTable.id, input.session_id))
        .execute();

      targetRoom = {
        ...room,
        user_count: room.user_count + 1,
        updated_at: new Date()
      };
    } else {
      // Create a new room
      const newRoomId = generateId();
      const now = new Date();

      const result = await db.insert(roomsTable)
        .values({
          id: newRoomId,
          created_at: now,
          updated_at: now,
          is_active: true,
          user_count: 1
        })
        .returning()
        .execute();

      // Update session to join the new room
      await db.update(userSessionsTable)
        .set({ 
          room_id: newRoomId,
          updated_at: new Date()
        })
        .where(eq(userSessionsTable.id, input.session_id))
        .execute();

      targetRoom = result[0];
    }

    return targetRoom;
  } catch (error) {
    console.error('Skip connection failed:', error);
    throw error;
  }
}
