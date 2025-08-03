
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { roomsTable, userSessionsTable, voiceMessagesTable } from '../db/schema';
import { type SendVoiceMessageInput } from '../schema';
import { sendVoiceMessage } from '../handlers/send_voice_message';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const testInput: SendVoiceMessageInput = {
  session_id: 'test-session-id',
  audio_data: 'base64-encoded-audio-data',
  duration_ms: 5000
};

describe('sendVoiceMessage', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should send a voice message successfully', async () => {
    // Create prerequisite room
    const roomId = randomUUID();
    await db.insert(roomsTable)
      .values({
        id: roomId,
        is_active: true,
        user_count: 1
      })
      .execute();

    // Create connected session in the room
    await db.insert(userSessionsTable)
      .values({
        id: testInput.session_id,
        room_id: roomId,
        is_connected: true,
        is_speaking: false
      })
      .execute();

    const result = await sendVoiceMessage(testInput);

    // Verify message structure
    expect(result.room_id).toEqual(roomId);
    expect(result.sender_session_id).toEqual(testInput.session_id);
    expect(result.audio_data).toEqual(testInput.audio_data);
    expect(result.duration_ms).toEqual(5000);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should save voice message to database', async () => {
    // Create prerequisite room and session
    const roomId = randomUUID();
    await db.insert(roomsTable)
      .values({
        id: roomId,
        is_active: true,
        user_count: 1
      })
      .execute();

    await db.insert(userSessionsTable)
      .values({
        id: testInput.session_id,
        room_id: roomId,
        is_connected: true,
        is_speaking: false
      })
      .execute();

    const result = await sendVoiceMessage(testInput);

    // Verify message was saved
    const messages = await db.select()
      .from(voiceMessagesTable)
      .where(eq(voiceMessagesTable.id, result.id))
      .execute();

    expect(messages).toHaveLength(1);
    expect(messages[0].room_id).toEqual(roomId);
    expect(messages[0].sender_session_id).toEqual(testInput.session_id);
    expect(messages[0].audio_data).toEqual(testInput.audio_data);
    expect(messages[0].duration_ms).toEqual(5000);
  });

  it('should throw error if session does not exist', async () => {
    await expect(sendVoiceMessage(testInput)).rejects.toThrow(/session not found/i);
  });

  it('should throw error if session is not in a room', async () => {
    // Create session without room
    await db.insert(userSessionsTable)
      .values({
        id: testInput.session_id,
        room_id: null,
        is_connected: true,
        is_speaking: false
      })
      .execute();

    await expect(sendVoiceMessage(testInput)).rejects.toThrow(/session is not in a room/i);
  });

  it('should throw error if session is not connected', async () => {
    // Create room and disconnected session
    const roomId = randomUUID();
    await db.insert(roomsTable)
      .values({
        id: roomId,
        is_active: true,
        user_count: 1
      })
      .execute();

    await db.insert(userSessionsTable)
      .values({
        id: testInput.session_id,
        room_id: roomId,
        is_connected: false,
        is_speaking: false
      })
      .execute();

    await expect(sendVoiceMessage(testInput)).rejects.toThrow(/session is not connected/i);
  });

  it('should throw error if room is inactive', async () => {
    // Create inactive room
    const roomId = randomUUID();
    await db.insert(roomsTable)
      .values({
        id: roomId,
        is_active: false,
        user_count: 1
      })
      .execute();

    await db.insert(userSessionsTable)
      .values({
        id: testInput.session_id,
        room_id: roomId,
        is_connected: true,
        is_speaking: false
      })
      .execute();

    await expect(sendVoiceMessage(testInput)).rejects.toThrow(/room not found or inactive/i);
  });
});
