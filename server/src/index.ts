
import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import { 
  createSessionInputSchema,
  joinRoomInputSchema,
  leaveRoomInputSchema,
  sendVoiceMessageInputSchema,
  updateSpeakingStatusInputSchema,
  skipConnectionInputSchema
} from './schema';

// Import handlers
import { createSession } from './handlers/create_session';
import { joinRoom } from './handlers/join_room';
import { leaveRoom } from './handlers/leave_room';
import { sendVoiceMessage } from './handlers/send_voice_message';
import { updateSpeakingStatus } from './handlers/update_speaking_status';
import { skipConnection } from './handlers/skip_connection';
import { getRoomStatus } from './handlers/get_room_status';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Create anonymous user session
  createSession: publicProcedure
    .input(createSessionInputSchema)
    .mutation(({ input }) => createSession(input)),

  // Join a voice room (random matching)
  joinRoom: publicProcedure
    .input(joinRoomInputSchema)
    .mutation(({ input }) => joinRoom(input)),

  // Leave current room
  leaveRoom: publicProcedure
    .input(leaveRoomInputSchema)
    .mutation(({ input }) => leaveRoom(input)),

  // Skip to next random partner
  skipConnection: publicProcedure
    .input(skipConnectionInputSchema)
    .mutation(({ input }) => skipConnection(input)),

  // Send voice message (walkie-talkie style)
  sendVoiceMessage: publicProcedure
    .input(sendVoiceMessageInputSchema)
    .mutation(({ input }) => sendVoiceMessage(input)),

  // Update speaking status (push-to-talk)
  updateSpeakingStatus: publicProcedure
    .input(updateSpeakingStatusInputSchema)
    .mutation(({ input }) => updateSpeakingStatus(input)),

  // Get current room and partner status
  getRoomStatus: publicProcedure
    .input(z.string())
    .query(({ input }) => getRoomStatus(input)),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`TRPC server listening at port: ${port}`);
}

start();
