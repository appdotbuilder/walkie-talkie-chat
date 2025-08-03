
import { db } from '../db';
import { userSessionsTable } from '../db/schema';
import { type UpdateSpeakingStatusInput, type UserSession } from '../schema';
import { eq } from 'drizzle-orm';

export const updateSpeakingStatus = async (input: UpdateSpeakingStatusInput): Promise<UserSession> => {
  try {
    // Update the user session's speaking status
    const result = await db.update(userSessionsTable)
      .set({
        is_speaking: input.is_speaking,
        updated_at: new Date()
      })
      .where(eq(userSessionsTable.id, input.session_id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error(`User session with id ${input.session_id} not found`);
    }

    return result[0];
  } catch (error) {
    console.error('Update speaking status failed:', error);
    throw error;
  }
};
