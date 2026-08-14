import { AIProvider } from "./provider";
import { AnthropicProvider } from "./anthropic-provider";

// Single place that decides which AIProvider implementation is active.
// Only Anthropic is implemented today; an OpenAI provider can be added here
// later (e.g. behind an AI_PROVIDER env var) without touching call sites.
let cachedProvider: AIProvider | null = null;
export function getAIProvider(): AIProvider {
  if (!cachedProvider) {
    cachedProvider = new AnthropicProvider();
  }
  return cachedProvider;
}

export type {
  AIProvider,
} from "./provider";
export * from "./types";
