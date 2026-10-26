// 仅用于自动化测试的假模型：设置 AI_PROVIDER=mock 时启用。不要在正式环境设置。
// 设置 AI_PROVIDER_MOCK_FAIL=1 可模拟 AI 服务中断。
import type { z } from "zod";
import type { AiProvider, AiResult } from "./provider";

export class MockProvider implements AiProvider {
  readonly model = "mock-model";

  async structured<T>(args: { system: string; user: string; schema: z.ZodType<T>; maxTokens: number }): Promise<AiResult<T>> {
    if (process.env.AI_PROVIDER_MOCK_FAIL === "1") return { ok: false, errorCode: "network", model: this.model };
    const candidate = {
      observation: "测试模型：这件事在记录中没有开始。",
      possible_explanations: ["任务可能偏大"],
      unknowns: ["测试数据，不代表真实情况"],
      adjustment: "shrink",
      next_task: { title: "测试：缩小后的任务", first_step: "打开文件写一句话", minimum_action: "写一句话", start_time: "09:30" },
      recheck_in_days: 3,
      confidence: "low",
    };
    const parsed = args.schema.safeParse(candidate);
    if (!parsed.success) return { ok: false, errorCode: "invalid_output", model: this.model };
    return { ok: true, output: parsed.data, model: this.model, inputTokens: 0, outputTokens: 0 };
  }
}
