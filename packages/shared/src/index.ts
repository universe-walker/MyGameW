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

// Billing
export const ZInvoiceCreateReq = z.object({
  userId: z.number().int(),
  type: z.enum(['hint_letter']),
  qty: z.union([z.literal(1), z.literal(2)]),
});
export const ZInvoiceCreateRes = z.object({ invoiceLink: z.string().url() });

// Profile
export const ZProfileRes = z.object({
  user: z.object({ id: z.number().int(), username: z.string().nullable(), first_name: z.string() }),
  profileScore: z.number().int(),
  hintAllowance: z.number().int(),
  achievements: z.array(
    z.object({ code: z.string(), title: z.string(), progress: z.number().min(0).max(1) })
  ),
});

// Word question reveal
export const ZQuestionRevealWord = z.object({ len: z.number().int(), mask: z.string(), canReveal: z.boolean() });
export const ZWordReveal = z.object({ position: z.number().int(), char: z.string().length(1) });

export type TInitVerifyReq = z.infer<typeof ZInitVerifyReq>;
export type TInitVerifyRes = z.infer<typeof ZInitVerifyRes>;
export type TRoomsCreateRes = z.infer<typeof ZRoomsCreateRes>;
export type TRoomsJoinReq = z.infer<typeof ZRoomsJoinReq>;
export type TInvoiceCreateReq = z.infer<typeof ZInvoiceCreateReq>;
export type TInvoiceCreateRes = z.infer<typeof ZInvoiceCreateRes>;
export type TProfileRes = z.infer<typeof ZProfileRes>;
export type TQuestionRevealWord = z.infer<typeof ZQuestionRevealWord>;
export type TWordReveal = z.infer<typeof ZWordReveal>;

export type TSocketClientToServerEvents = {
  'rooms:create': () => void;
  'rooms:join': (payload: { roomId: string }) => void;
  'hint:reveal_letter': () => void;
  ping: () => void;
};

export type TSocketServerToClientEvents = {
  'room:state': (state: {
    roomId: string;
    players: Array<{ id: number; name: string }>;
    createdAt: number;
  }) => void;
  'word:reveal': (payload: { position: number; char: string }) => void;
  pong: () => void;
};


