
import { db } from '../db';
import { roomsTable, userSessionsTable } from '../db/schema';
import { type LeaveRoomInput } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function leaveRoom(input: LeaveRoomInput): Promise<{ success: boolean }> {
  try {
    // Get the user session to find current room
    const userSession = await db.select()
      .from(userSessionsTable)
      .where(eq(userSessionsTable.id, input.session_id))
      .execute();

    if (userSession.length === 0) {
      throw new Error('User session not found');
    }

    const session = userSession[0];
    if (!session.room_id) {
      // User is not in any room, but operation is still successful
      return { success: true };
    }

    const roomId = session.room_id;

    // Update user session to remove room association and set speaking to false
    await db.update(userSessionsTable)
      .set({
        room_id: null,
        is_speaking: false,
        updated_at: new Date()
      })
      .where(eq(userSessionsTable.id, input.session_id))
      .execute();

    // Get current room to update user count
    const room = await db.select()
      .from(roomsTable)
      .where(eq(roomsTable.id, roomId))
      .execute();

    if (room.length === 0) {
      throw new Error('Room not found');
    }

    const currentRoom = room[0];
    const newUserCount = Math.max(0, currentRoom.user_count - 1);

    // Update room user count and deactivate if empty
    await db.update(roomsTable)
      .set({
        user_count: newUserCount,
        is_active: newUserCount > 0,
        updated_at: new Date()
      })
      .where(eq(roomsTable.id, roomId))
      .execute();

    return { success: true };
  } catch (error) {
    console.error('Leave room failed:', error);
    throw error;
  }
}
