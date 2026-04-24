import "dotenv/config";
import OpenAI from "openai";
import type { Node, ProviderEnum } from "./types.ts";

const SYSTEM_PROMPT = `
You are an expert knowledge architect.

Build a semantic TREE of knowledge from large text.

Understand ideas, not chapters or positions.

Create nodes only for meaningful concepts, principles, processes, mechanisms, entities, or themes.

Good nodes:
- Assets vs Liabilities
- Cash Flow Thinking
- Corporate Tax Advantages
- Fear of Loss
- Investing Principles

Bad nodes:
- Chapter 1
- Section 2
- Middle Part
- Final Pages

Input:
1. PREVIOUS_TREE
2. NEW_TEXT_CHUNK
3. CHUNK_START_INDEX

The first character of NEW_TEXT_CHUNK equals CHUNK_START_INDEX in the original text.

Use PREVIOUS_TREE to:
- detect existing concepts
- avoid duplicates
- continue hierarchy
- continue nodeId numbering

NodeId rules:
- Find highest existing nodeId in PREVIOUS_TREE
- Start new ids from next number
- Never reuse ids
- Never reset ids
- Zero padded numeric strings

Your job:
- Read NEW_TEXT_CHUNK
- Detect important concepts
- Merge repeated ideas with existing concepts
- Create only new nodes or improved nodes
- Return only delta nodes, never full tree

Hierarchy:
- Parent = broad topic
- Child = narrower subtopic

Rules:
1. Do not create nodes from chapter names.
2. Do not split by equal ranges.
3. Prefer fewer strong nodes.
4. Summary must contain useful meaning.
5. Every node must help future retrieval.
6. stringSubset must be absolute indices.
7. If nothing valuable is new, return {"nodes":[]}

Node format:
{
  "nodeId": "0015",
  "title": "Fear of Loss",
  "summary": "Explains how fear of losing money prevents action, learning, and long-term investing decisions.",
  "stringSubset": [62000, 64500],
  "nodes": []
}

Title:
- max 8 words
- concept focused

Summary:
- concise but meaningful
- explain lesson, mechanism, or principle
- no filler

CRITICAL OUTPUT RULES:

Return ONLY valid JSON.
Return ONLY one raw JSON object.
No markdown.
No code fences.
No explanation.
No notes.
No thinking.
No intro text.
No trailing text.
No comments.
No natural language before JSON.
No natural language after JSON.

If you cannot comply, still output exactly:
{"nodes":[]}

Required output shape only:

{
  "nodes": [...]
}
`;

const BASE_URLS = {
    openai: "https://api.openai.com/v1",
    gemini: "https://generativelanguage.googleapis.com/v1beta/openai/",
    anthropic: "https://api.anthropic.com/v1",
    grok: "https://api.x.ai/v1",
    ollama: "http://localhost:11434/v1",
    openrouter: "https://openrouter.ai/api/v1",
};

export class TreeIndex {
    private tree: Node[] = [];
    private openai: OpenAI;
    private model: string;

    constructor(provider: ProviderEnum, model = "inclusionai/ling-2.6-flash:free") {
        this.model = model;
        this.openai = new OpenAI({
            baseURL: BASE_URLS[provider],
            apiKey: process.env.TREEINDEX_API_KEY,
        });
    }

    private mergeNodes(target: Node[], incoming: Node[]) {
        for (const node of incoming) {
            const existing = target.find((n) => n.title === node.title);

            if (!existing) {
                target.push(node);
                continue;
            }

            if (node.summary && node.summary.length > (existing.summary?.length || 0)) {
                existing.summary = node.summary;
            }

            existing.stringSubset = [
                Math.min(existing.stringSubset[0], node.stringSubset[0]),
                Math.max(existing.stringSubset[1], node.stringSubset[1]),
            ];

            existing.nodes = existing.nodes || [];
            this.mergeNodes(existing.nodes, node.nodes || []);
        }
    }

    private getMaxCoveredIndex(tree: Node[]): number {
        let max = 0;

        for (const node of tree) {
            if (node.stringSubset?.[1] > max) {
                max = node.stringSubset[1];
            }

            if (node.nodes?.length) {
                const childMax = this.getMaxCoveredIndex(node.nodes);
                if (childMax > max) max = childMax;
            }
        }

        return max;
    }

    async generateTree(data: string, startSubset: number): Promise<Node[]> {
        if (data.length < 100) return this.tree;

        const completion = await this.openai.chat.completions.create({
            model: this.model,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                {
                    role: "user",
                    content: `PREVIOUS_TREE: \n ${JSON.stringify(this.tree)} CHUNK_START_INDEX: ${startSubset}`,
                },
                { role: "user", content: `NEW_TEXT_CHUNK: ${data}` },
            ],
        });

        let raw = completion.choices?.[0]?.message?.content || '{"nodes":[]}';
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (err) {
            console.log("Invalid JSON:", raw);
            return [];
        }
        const newNodes: Node[] = parsed.nodes || [];

        if (!newNodes.length) return [];

        this.mergeNodes(this.tree, newNodes);

        const lastNode = newNodes[newNodes.length - 1];

        const maxCovered = this.getMaxCoveredIndex(this.tree);
        if (maxCovered <= startSubset) return [];

        const nextStart = Math.max(0, maxCovered - 400);
        const nextChunk = data.slice(nextStart);

        await this.generateTree(nextChunk, lastNode.stringSubset[1]);
        return this.tree;
    }

    async retrieveRelevantNodes(tree: Node[], query: string): Promise<string[]> {
        const completion = await this.openai.chat.completions.create({
            model: this.model,
            messages: [
                {
                    role: "system",
                    content: `You are an expert knowledge retriever. You have a hierarchical tree of knowledge nodes with titles, summaries, and string subsets. When given a query, you find the most relevant nodes based on their titles and summaries. You return a list of nodeIds that are most relevant to the query. Always return valid JSON in the format: {"relevantNodeIds": ["0015", "0023"]}`,
                },
                { role: "user", content: `QUERY: ${query} KNOWLEDGE_TREE: ${JSON.stringify(tree)}` },
            ],
        });

        let raw = completion.choices?.[0]?.message?.content || `{"relevantNodeIds":[]}`;
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (err) {
            console.log("Invalid JSON:", raw);
            return [];
        }
        const relevantNodeIds: string[] = parsed.relevantNodeIds || [];
        console.log("Relevant Node IDs:", relevantNodeIds);
        return relevantNodeIds;
    }

    async findNodes(nodeIds: string[], nodes: Node[], sourceText: string): Promise<string> {
        let foundNodesData: string = "";

        for (const node of nodes) {
            if (nodeIds.includes(node.nodeId)) {
                const data = sourceText.slice(node.stringSubset[0], node.stringSubset[1]);
                foundNodesData += data + "\n";
            }
            if (node.nodes?.length) {
                foundNodesData += await this.findNodes(nodeIds, node.nodes, sourceText);
            }
        }

        return foundNodesData;
    }

    async completion(tree: Node[], query: string, sourceText: string): Promise<string> {
        const relevantNodeIds = await this.retrieveRelevantNodes(tree, query);

        const foundNodesData = await this.findNodes(relevantNodeIds, tree, sourceText);

        const completion = await this.openai.chat.completions.create({
            model: this.model,
            messages: [
                {
                    role: "system",
                    content: `You are an expert analyst. You have retrieved relevant knowledge nodes with their data based on a query. Analyze the data from these nodes to answer the query as best as possible.
                    QUERY: ${query} RETRIEVED_NODES_DATA: ${foundNodesData} Provide a concise and informative answer based on the retrieved data.`,
                },
            ],
        });

        const answer = completion.choices?.[0]?.message?.content || "No answer generated.";
        return answer;
    }
}