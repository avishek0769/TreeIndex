export interface Node {
    nodeId: string;
    title: string;
    summary: string;
    stringSubset: [number, number];
    nodes: Node[]
}

export enum ProviderEnum {
    OPENAI = "openai",
    GEMINI = "gemini",
    ANTHROPIC = "anthropic",
    GROK = "grok",
    OLLAMA = "ollama",
    OPENROUTER = "openrouter"
}