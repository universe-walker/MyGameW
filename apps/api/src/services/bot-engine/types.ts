import type { BotProfilesService } from '../bot-profiles.service';

export type Phase =
  | 'idle'
  | 'prepare'
  | 'buzzer_window'
  | 'answer_wait'
  | 'score_apply'
  | 'round_end'
  | 'final';

export type RoomRuntime = {
  running: boolean;
  phase: Phase;
  until?: number;
  activePlayerId?: number | null;
  board?: { title: string; values: number[] }[];
  question?: { category: string; value: number; prompt: string } | undefined;
  questionId?: string;
  questionOptions?: string[];
  isSuperQuestion?: boolean;
  sessionId?: string;
  scores?: Record<number, number>;
  lastAnswerCorrect?: boolean;
  retryUsed?: boolean;
  order?: number[];
  pickerIndex?: number;
  answerIndex?: number;
  questionStartPickerIndex?: number;
  botProfiles?: Map<number, ReturnType<BotProfilesService['getAll']>[number]>;
  round?: number;
  superCells?: Map<number, Set<string>>;
  blitzCells?: Map<number, Set<string>>;
  cellAssignments?: Map<number, Map<string, string>>;
  blitzActive?: boolean;
  blitzOwnerId?: number;
  blitzIndex?: number;
  blitzTotal?: number;
  blitzBaseValue?: number;
  blitzCategory?: string;
  blitzQuestions?: { id: string; value: number; prompt: string }[];
  answerText?: string;
  currentMask?: string;
  hintUsage?: Map<number, { used: number; revealed: Set<number> }>;
};
