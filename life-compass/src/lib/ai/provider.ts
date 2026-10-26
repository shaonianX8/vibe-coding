// AI 接口与业务逻辑分离：换模型或换供应商，只需要新增一个实现。
import { z } from "zod";

export const ADJUSTMENTS = [
  "none",
  "continue",
  "carry_remaining",
  "shrink",
  "reschedule",
  "define_first_step",
  "external_commitment",
  "recovery_minimum",
  "reprioritize",
  "review_goal",
] as const;

/** AI 输出的唯一合法形状。任何不符合的输出都会被丢弃，规则建议照常显示。 */
export const FollowupAiSchema = z.object({
  observation: z.string().describe("只基于数据的事实观察，一到两句"),
  possible_explanations: z.array(z.string()).describe("可能的解释，最多三条，不做人格或心理诊断"),
  unknowns: z.array(z.string()).describe("数据不足、尚不清楚的地方"),
  adjustment: z.enum(ADJUSTMENTS),
  next_task: z
    .object({
      title: z.string(),
      first_step: z.string().describe("两分钟内能开始的具体动作"),
      minimum_action: z.string().describe("时间精力不足时仍有真实价值的最低行动"),
      start_time: z.string().nullable().describe("HH:MM，没有把握时为 null"),
    })
    .nullable(),
  recheck_in_days: z.number().describe("几天后复查，1 到 14"),
  confidence: z.enum(["low", "medium", "high"]),
});

export type FollowupAiOutput = z.infer<typeof FollowupAiSchema>;

export type AiResult<T> =
  | { ok: true; output: T; model: string; inputTokens: number | null; outputTokens: number | null }
  | { ok: false; errorCode: string; model: string };

export interface AiProvider {
  readonly model: string;
  structured<T>(args: { system: string; user: string; schema: z.ZodType<T>; maxTokens: number }): Promise<AiResult<T>>;
}

/** 截断并清洗用户文本，防止超长输入和控制字符 */
export function clip(text: string | null | undefined, max = 500): string | null {
  if (!text) return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}
