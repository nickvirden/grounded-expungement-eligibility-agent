/**
 * Zod schemas mirroring the FastAPI Pydantic models.
 * These are the single source of truth for client-side validation.
 */
import { z } from 'zod';

// ─── Eligibility ─────────────────────────────────────────────────────────────

export const assessRequestSchema = z.object({
  state: z.string().min(2).max(50),
  question_id: z.number().int().min(0),
  answer_position: z.number().int().min(0),
});

export type AssessRequest = z.infer<typeof assessRequestSchema>;

export const answerOptionSchema = z
  .object({
    // The API (and Texas JSON tree) uses 'value'; accept both for forward-compat
    value: z.string().optional(),
    label: z.string().optional(),
    position: z.number().int(),
  })
  .transform((obj) => ({
    label: obj.label ?? obj.value ?? '',
    position: obj.position,
  }));

export const assessResponseSchema = z.object({
  is_terminal: z.boolean(),
  result_key: z.string().nullable().optional(),
  result_label: z.string().nullable().optional(),
  next_question_id: z.number().int().nullable().optional(),
  next_question_text: z.string().nullable().optional(),
  next_question_help: z.string().nullable().optional(),
  next_answers: z.array(answerOptionSchema).nullable().optional(),
  questions_left: z.number().int().nullable().optional(),
  traversed_path: z.array(z.string()).default([]),
});

export type AssessResponse = z.infer<typeof assessResponseSchema>;

// ─── Intake ───────────────────────────────────────────────────────────────────

export const intakeModeSchema = z.enum(['quick', 'agent']);
export type IntakeMode = z.infer<typeof intakeModeSchema>;

export const intakeCreateSchema = z.object({
  mode: intakeModeSchema,
  state: z.string().min(2).max(50),
  narrative_text: z.string().max(4000).optional(),
});

export type IntakeCreate = z.infer<typeof intakeCreateSchema>;

export const intakeCreateResponseSchema = z.object({
  intake_id: z.string(),
  status: z.string(),
});

export type IntakeCreateResponse = z.infer<typeof intakeCreateResponseSchema>;

// ─── Service recommendation ───────────────────────────────────────────────────

export const serviceRecSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  base_price_usd: z.number(),
});

export type ServiceRec = z.infer<typeof serviceRecSchema>;

// ─── Eligibility report ───────────────────────────────────────────────────────

export const eligibilityReportSchema = z.object({
  intake_id: z.string(),
  state: z.string(),
  result_key: z.string(),
  result_label: z.string(),
  confidence: z.number().min(0).max(1).default(1),
  traversed_path: z.array(z.string()).default([]),
  recommended_services: z.array(serviceRecSchema).default([]),
  summary: z.string().optional(),
});

export type EligibilityReport = z.infer<typeof eligibilityReportSchema>;

// ─── States ───────────────────────────────────────────────────────────────────

export const stateInfoSchema = z.object({
  state: z.string(),
  node_count: z.number().int(),
  transition_count: z.number().int(),
  result_keys: z.array(z.string()),
});

export type StateInfo = z.infer<typeof stateInfoSchema>;

// ─── Agent SSE events ─────────────────────────────────────────────────────────

export const sseRunStartedSchema = z.object({ type: z.literal('run_started'), run_id: z.string() });
export const sseTextChunkSchema = z.object({ type: z.literal('text_chunk'), text: z.string() });
export const sseFinalSchema = z.object({
  type: z.literal('final'),
  report: eligibilityReportSchema,
});
export const sseErrorSchema = z.object({
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
});

export const sseEventSchema = z.discriminatedUnion('type', [
  sseRunStartedSchema,
  sseTextChunkSchema,
  sseFinalSchema,
  sseErrorSchema,
]);

export type SseEvent = z.infer<typeof sseEventSchema>;
