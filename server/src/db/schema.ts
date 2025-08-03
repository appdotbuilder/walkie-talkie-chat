
import { pgTable, text, timestamp, boolean, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const roomsTable = pgTable('rooms', {
  id: text('id').primaryKey(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  user_count: integer('user_count').default(0).notNull()
});

export const userSessionsTable = pgTable('user_sessions', {
  id: text('id').primaryKey(),
  room_id: text('room_id').references(() => roomsTable.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
  is_connected: boolean('is_connected').default(true).notNull(),
  is_speaking: boolean('is_speaking').default(false).notNull()
});

export const voiceMessagesTable = pgTable('voice_messages', {
  id: text('id').primaryKey(),
  room_id: text('room_id').references(() => roomsTable.id).notNull(),
  sender_session_id: text('sender_session_id').references(() => userSessionsTable.id).notNull(),
  audio_data: text('audio_data').notNull(), // Base64 encoded audio data
  created_at: timestamp('created_at').defaultNow().notNull(),
  duration_ms: integer('duration_ms').notNull()
});

// Relations
export const roomsRelations = relations(roomsTable, ({ many }) => ({
  userSessions: many(userSessionsTable),
  voiceMessages: many(voiceMessagesTable)
}));

export const userSessionsRelations = relations(userSessionsTable, ({ one, many }) => ({
  room: one(roomsTable, {
    fields: [userSessionsTable.room_id],
    references: [roomsTable.id]
  }),
  voiceMessages: many(voiceMessagesTable)
}));

export const voiceMessagesRelations = relations(voiceMessagesTable, ({ one }) => ({
  room: one(roomsTable, {
    fields: [voiceMessagesTable.room_id],
    references: [roomsTable.id]
  }),
  sender: one(userSessionsTable, {
    fields: [voiceMessagesTable.sender_session_id],
    references: [userSessionsTable.id]
  })
}));

// TypeScript types for the table schemas
export type Room = typeof roomsTable.$inferSelect;
export type NewRoom = typeof roomsTable.$inferInsert;
export type UserSession = typeof userSessionsTable.$inferSelect;
export type NewUserSession = typeof userSessionsTable.$inferInsert;
export type VoiceMessage = typeof voiceMessagesTable.$inferSelect;
export type NewVoiceMessage = typeof voiceMessagesTable.$inferInsert;

// Export all tables for proper query building
export const tables = { 
  rooms: roomsTable,
  userSessions: userSessionsTable,
  voiceMessages: voiceMessagesTable
};
