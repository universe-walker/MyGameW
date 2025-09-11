import { z } from 'zod';
// Avoid coupling shared package to socket.io-client types at build time

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
// Solo: explicit create response (alias by contract name in TZ)
export const ZCreateSoloRes = z.object({ roomId: z.string().uuid() });
export const ZRoomsJoinReq = z.object({ roomId: z.string().uuid() });
export const ZSoloPauseReq = z.object({ roomId: z.string().uuid() });
export const ZSoloResumeReq = z.object({ roomId: z.string().uuid() });
export const ZRoomsLeaveReq = z.object({ roomId: z.string().uuid() });

// WS controls
export const ZBuzzerPressReq = z.object({ roomId: z.string().uuid() });
export const ZAnswerSubmitReq = z.object({ roomId: z.string().uuid(), text: z.string().min(1) });
export const ZBoardPickReq = z.object({
  roomId: z.string().uuid(),
  category: z.string().min(1),
  value: z.number().int(),
});

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

// RoomState and bot hint contracts for solo
export const ZRoomPlayer = z.object({ id: z.number().int(), name: z.string(), bot: z.boolean().optional() });
export const ZRoomState = z.object({
  roomId: z.string().uuid(),
  solo: z.boolean(),
  players: z.array(ZRoomPlayer),
  createdAt: z.number().int(),
});
export const ZBotHint = z.object({ playerId: z.number().int(), action: z.enum(['buzz', 'answer', 'pass']) });

export type TInitVerifyReq = z.infer<typeof ZInitVerifyReq>;
export type TInitVerifyRes = z.infer<typeof ZInitVerifyRes>;
export type TRoomsCreateRes = z.infer<typeof ZRoomsCreateRes>;
export type TCreateSoloRes = z.infer<typeof ZCreateSoloRes>;
export type TRoomsJoinReq = z.infer<typeof ZRoomsJoinReq>;
export type TSoloPauseReq = z.infer<typeof ZSoloPauseReq>;
export type TSoloResumeReq = z.infer<typeof ZSoloResumeReq>;
export type TRoomsLeaveReq = z.infer<typeof ZRoomsLeaveReq>;
export type TBuzzerPressReq = z.infer<typeof ZBuzzerPressReq>;
export type TAnswerSubmitReq = z.infer<typeof ZAnswerSubmitReq>;
export type TBoardPickReq = z.infer<typeof ZBoardPickReq>;
export type TInvoiceCreateReq = z.infer<typeof ZInvoiceCreateReq>;
export type TInvoiceCreateRes = z.infer<typeof ZInvoiceCreateRes>;
export type TProfileRes = z.infer<typeof ZProfileRes>;
export type TQuestionRevealWord = z.infer<typeof ZQuestionRevealWord>;
export type TWordReveal = z.infer<typeof ZWordReveal>;
export type TRoomPlayer = z.infer<typeof ZRoomPlayer>;
export type TRoomState = z.infer<typeof ZRoomState>;

// Solo game phases and bot statuses
export const ZGamePhase = z.enum([
  'idle',
  'prepare',
  'buzzer_window',
  'answer_wait',
  'score_apply',
  'round_end',
  'final',
]);
export const ZGamePhaseEvent = z.object({
  roomId: z.string().uuid(),
  phase: ZGamePhase,
  // Optional timestamp (ms since epoch) when this phase is expected to end
  until: z.number().int().optional(),
  // Optional: which player currently holds the right to answer (null when none)
  activePlayerId: z.number().int().nullable().optional(),
  // Optional: current question info for the phase
  question: z
    .object({
      category: z.string(),
      value: z.number().int(),
      prompt: z.string(),
      // If present, question is in multiple-choice mode (Super Game)
      options: z.array(z.string()).optional(),
    })
    .optional(),
  // Optional: current scores by playerId
  scores: z.record(z.string(), z.number().int()).optional(),
});
export const ZBotStatus = z.object({
  roomId: z.string().uuid(),
  playerId: z.number().int(),
  status: z.enum(['idle', 'thinking', 'buzzed', 'answering', 'passed', 'wrong', 'correct']),
  at: z.number().int(),
});

export type TGamePhase = z.infer<typeof ZGamePhase>;
export type TGamePhaseEvent = z.infer<typeof ZGamePhaseEvent>;
export type TBotStatus = z.infer<typeof ZBotStatus>;

// Board state (lightweight for client rendering)
export const ZBoardCategory = z.object({ title: z.string(), values: z.array(z.number().int()) });
export const ZBoardState = z.object({ roomId: z.string().uuid(), categories: z.array(ZBoardCategory) });
export type TBoardCategory = z.infer<typeof ZBoardCategory>;
export type TBoardState = z.infer<typeof ZBoardState>;

// Reveal the correct answer after all failed
export const ZAnswerReveal = z.object({
  roomId: z.string().uuid(),
  category: z.string(),
  value: z.number().int(),
  text: z.string(),
});
export type TAnswerReveal = z.infer<typeof ZAnswerReveal>;

export type TSocketClientToServerEvents = {
  'rooms:create': () => void;
  'rooms:join': (payload: { roomId: string }) => void;
  'rooms:leave': (payload: { roomId: string }) => void;
  'hint:reveal_letter': () => void;
  // Solo-only controls
  'solo:pause': (payload: { roomId: string }) => void;
  'solo:resume': (payload: { roomId: string }) => void;
  // Human actions
  'buzzer:press': (payload: { roomId: string }) => void;
  'answer:submit': (payload: { roomId: string; text: string }) => void;
  'board:pick': (payload: { roomId: string; category: string; value: number }) => void;
  ping: () => void;
};

export type TSocketServerToClientEvents = {
  'room:state': (state: TRoomState) => void;
  'game:phase': (payload: TGamePhaseEvent) => void;
  'bot:status': (payload: TBotStatus) => void;
  'board:state': (payload: TBoardState) => void;
  // Masked word for current question (for UI placeholders)
  'word:mask': (payload: TQuestionRevealWord) => void;
  'word:reveal': (payload: { position: number; char: string }) => void;
  'answer:reveal': (payload: TAnswerReveal) => void;
  // Near-miss notification to allow retry without penalty
  'answer:near_miss': (payload: { message: string }) => void;
  pong: () => void;
};

// Fully-typed socket shared across client and server
export type Socket = {
  emit: (...args: any[]) => void;
  on: (...args: any[]) => void;
  off: (...args: any[]) => void;
  id?: string;
  connected?: boolean;
  io?: any;
  disconnect: () => void;
};


