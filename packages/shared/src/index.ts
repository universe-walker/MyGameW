import { z } from 'zod';

export const ZInitVerifyReq = z.object({ initDataRaw: z.string().min(1) });
export const ZInitVerifyRes = z.object({
  ok: z.literal(true),
  user: z.object({
    id: z.number().int(),
    username: z.string().nullable(),
    first_name: z.string(),
  }),
  issuedAt: z.number().int(),
});

export const ZRoomsCreateRes = z.object({ roomId: z.string().uuid() });
export const ZRoomsJoinReq = z.object({ roomId: z.string().uuid() });

export type TInitVerifyReq = z.infer<typeof ZInitVerifyReq>;
export type TInitVerifyRes = z.infer<typeof ZInitVerifyRes>;
export type TRoomsCreateRes = z.infer<typeof ZRoomsCreateRes>;
export type TRoomsJoinReq = z.infer<typeof ZRoomsJoinReq>;

export type TSocketClientToServerEvents = {
  'rooms:create': () => void;
  'rooms:join': (payload: { roomId: string }) => void;
  ping: () => void;
};

export type TSocketServerToClientEvents = {
  'room:state': (state: {
    roomId: string;
    players: Array<{ id: number; name: string }>;
    createdAt: number;
  }) => void;
  pong: () => void;
};


