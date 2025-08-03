
import { db } from '../db';
import { userSessionsTable } from '../db/schema';
import { type CreateSessionInput, type UserSession } from '../schema';
import { randomUUID } from 'crypto';

export const createSession = async (input: CreateSessionInput): Promise<UserSession> => {
  try {
    // Generate unique session ID
    const sessionId = randomUUID();

    // Insert session record
    const result = await db.insert(userSessionsTable)
      .values({
        id: sessionId,
        room_id: null, // Not in any room initially
        is_connected: true,
        is_speaking: false
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Session creation failed:', error);
    throw error;
  }
};
