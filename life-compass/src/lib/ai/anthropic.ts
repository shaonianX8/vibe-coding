import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import type { AiProvider, AiResult } from "./provider";

export class AnthropicProvider implements AiProvider {
  private client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    // 超时短一些：AI 只是补充，失败时规则建议照常可用
    this.client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
  }

  async structured<T>(args: { system: string; user: string; schema: z.ZodType<T>; maxTokens: number }): Promise<AiResult<T>> {
    try {
      const res = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: args.maxTokens,
        // 安全分类器拒绝时，服务端自动换到推荐的备用模型
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: betaZodOutputFormat(args.schema) },
        system: args.system,
        messages: [{ role: "user", content: args.user }],
      });
      if (res.stop_reason === "refusal") return { ok: false, errorCode: "refusal", model: this.model };
      if (res.stop_reason === "max_tokens") return { ok: false, errorCode: "max_tokens", model: this.model };
      if (!res.parsed_output) return { ok: false, errorCode: "invalid_output", model: this.model };
      return {
        ok: true,
        output: res.parsed_output as T,
        model: res.model,
        inputTokens: res.usage.input_tokens ?? null,
        outputTokens: res.usage.output_tokens ?? null,
      };
    } catch (error) {
      // 只记录错误类型，不记录请求内容，避免敏感信息进入日志
      let code = "unknown";
      if (error instanceof Anthropic.RateLimitError) code = "rate_limited";
      else if (error instanceof Anthropic.AuthenticationError) code = "auth";
      else if (error instanceof Anthropic.BadRequestError) code = "bad_request";
      else if (error instanceof Anthropic.APIConnectionTimeoutError) code = "timeout";
      else if (error instanceof Anthropic.APIConnectionError) code = "network";
      else if (error instanceof Anthropic.APIError) code = `api_${error.status ?? "error"}`;
      return { ok: false, errorCode: code, model: this.model };
    }
  }
}
