
import { z } from 'zod';

// Room schema
export const roomSchema = z.object({
  id: z.string(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  is_active: z.boolean(),
  user_count: z.number().int().min(0).max(2)
});

export type Room = z.infer<typeof roomSchema>;

// User session schema
export const userSessionSchema = z.object({
  id: z.string(),
  room_id: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  is_connected: z.boolean(),
  is_speaking: z.boolean()
});

export type UserSession = z.infer<typeof userSessionSchema>;

// Voice message schema
export const voiceMessageSchema = z.object({
  id: z.string(),
  room_id: z.string(),
  sender_session_id: z.string(),
  audio_data: z.string(), // Base64 encoded audio data
  created_at: z.coerce.date(),
  duration_ms: z.number().int().positive()
});

export type VoiceMessage = z.infer<typeof voiceMessageSchema>;

// Input schemas
export const createRoomInputSchema = z.object({
  session_id: z.string()
});

export type CreateRoomInput = z.infer<typeof createRoomInputSchema>;

export const joinRoomInputSchema = z.object({
  session_id: z.string(),
  room_id: z.string().optional() // Optional - if not provided, find available room
});

export type JoinRoomInput = z.infer<typeof joinRoomInputSchema>;

export const leaveRoomInputSchema = z.object({
  session_id: z.string()
});

export type LeaveRoomInput = z.infer<typeof leaveRoomInputSchema>;

export const sendVoiceMessageInputSchema = z.object({
  session_id: z.string(),
  audio_data: z.string(),
  duration_ms: z.number().int().positive()
});

export type SendVoiceMessageInput = z.infer<typeof sendVoiceMessageInputSchema>;

export const updateSpeakingStatusInputSchema = z.object({
  session_id: z.string(),
  is_speaking: z.boolean()
});

export type UpdateSpeakingStatusInput = z.infer<typeof updateSpeakingStatusInputSchema>;

export const createSessionInputSchema = z.object({
  // No input needed - session will be auto-generated
});

export type CreateSessionInput = z.infer<typeof createSessionInputSchema>;

export const skipConnectionInputSchema = z.object({
  session_id: z.string()
});

export type SkipConnectionInput = z.infer<typeof skipConnectionInputSchema>;
