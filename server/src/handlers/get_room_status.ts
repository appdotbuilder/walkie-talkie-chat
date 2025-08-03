
import { db } from '../db';
import { roomsTable, userSessionsTable } from '../db/schema';
import { type Room, type UserSession } from '../schema';
import { eq, and, ne } from 'drizzle-orm';

export async function getRoomStatus(sessionId: string): Promise<{ room: Room | null; partner: UserSession | null }> {
  try {
    // First, get the user's session and room information
    const userSession = await db.select()
      .from(userSessionsTable)
      .where(eq(userSessionsTable.id, sessionId))
      .execute();

    if (userSession.length === 0 || !userSession[0].room_id) {
      return {
        room: null,
        partner: null
      };
    }

    const session = userSession[0];
    const roomId = session.room_id as string; // Type assertion - we know it's not null due to the check above

    // Get the room details
    const roomResult = await db.select()
      .from(roomsTable)
      .where(eq(roomsTable.id, roomId))
      .execute();

    if (roomResult.length === 0) {
      return {
        room: null,
        partner: null
      };
    }

    const room = roomResult[0];

    // Get the partner (other user in the same room, excluding current session)
    const partnerResult = await db.select()
      .from(userSessionsTable)
      .where(
        and(
          eq(userSessionsTable.room_id, roomId),
          ne(userSessionsTable.id, sessionId),
          eq(userSessionsTable.is_connected, true)
        )
      )
      .execute();

    const partner = partnerResult.length > 0 ? partnerResult[0] : null;

    return {
      room,
      partner
    };
  } catch (error) {
    console.error('Get room status failed:', error);
    throw error;
  }
}
