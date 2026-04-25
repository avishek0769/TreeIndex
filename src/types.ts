export interface Node {
    nodeId: string;
    title: string;
    summary: string;
    stringSubset: [number, number];
    nodes: Node[];
}

export type ProviderEnum = "openai" | "gemini" | "anthropic" | "grok" | "ollama" | "openrouter";

export interface ConstructorParams {
    provider: ProviderEnum;
    apiKey: string;
}
