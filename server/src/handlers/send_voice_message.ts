
import { db } from '../db';
import { voiceMessagesTable, userSessionsTable, roomsTable } from '../db/schema';
import { type SendVoiceMessageInput, type VoiceMessage } from '../schema';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';

export const sendVoiceMessage = async (input: SendVoiceMessageInput): Promise<VoiceMessage> => {
  try {
    // First, verify the session exists and is connected to a room
    const sessionResult = await db.select()
      .from(userSessionsTable)
      .where(eq(userSessionsTable.id, input.session_id))
      .execute();

    if (sessionResult.length === 0) {
      throw new Error('Session not found');
    }

    const session = sessionResult[0];
    if (!session.room_id) {
      throw new Error('Session is not in a room');
    }

    if (!session.is_connected) {
      throw new Error('Session is not connected');
    }

    // Verify the room exists and is active
    const roomResult = await db.select()
      .from(roomsTable)
      .where(eq(roomsTable.id, session.room_id))
      .execute();

    if (roomResult.length === 0 || !roomResult[0].is_active) {
      throw new Error('Room not found or inactive');
    }

    // Create the voice message
    const voiceMessageId = randomUUID();
    const result = await db.insert(voiceMessagesTable)
      .values({
        id: voiceMessageId,
        room_id: session.room_id,
        sender_session_id: input.session_id,
        audio_data: input.audio_data,
        duration_ms: input.duration_ms
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Voice message sending failed:', error);
    throw error;
  }
};
