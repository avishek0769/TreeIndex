import OpenAI from "openai";
import type { ConstructorParams, FoundNode, Node, ProviderEnum } from "./types.js";
import { COMPLETION_SYSTEM_PROMPT, RETRIEVAL_SYSTEM_PROMPT, SYSTEM_PROMPT } from "./prompt.js";
import fs from "fs/promises";

export type { Node, ProviderEnum } from "./types.js";

const BASE_URLS: Record<ProviderEnum, string> = {
    openai: "https://api.openai.com/v1",
    gemini: "https://generativelanguage.googleapis.com/v1beta/openai/",
    anthropic: "https://api.anthropic.com/v1",
    grok: "https://api.x.ai/v1",
    ollama: "http://localhost:11434/v1",
    openrouter: "https://openrouter.ai/api/v1",
};

class TreeIndex {
    private tree: Node[];
    private openai: OpenAI;
    private model: string;
    private data: string;

    constructor({ provider, apiKey }: ConstructorParams) {
        this.tree = [];
        this.model = "inclusionai/ling-2.6-flash:free";
        this.data = "";
        this.openai = new OpenAI({
            baseURL: BASE_URLS[provider],
            apiKey,
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

    private async generateTreeRecursive(chunkText: string, startSubset: number = 0): Promise<Node[]> {
        if (chunkText.length < 100) return this.tree;

        const completion = await this.openai.chat.completions.create({
            model: this.model,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                {
                    role: "user",
                    content: `
                        PREVIOUS_TREE: \n ${JSON.stringify(this.tree)}
                        CHUNK_START_INDEX: ${startSubset}
                        NEW_TEXT_CHUNK: ${chunkText}
                    `,
                },
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
        const nextChunk = this.data.slice(nextStart);

        await this.generateTreeRecursive(nextChunk, lastNode.stringSubset[1]);
        return this.tree;
    }

    loadData(data: string) {
        if (!data || data.length === 0) {
            throw new Error("Data cannot be empty");
        }
        this.data = data;
    }

    loadTree(tree: Node[]) {
        if (!tree || tree.length === 0) {
            throw new Error("Tree cannot be empty");
        }
        this.tree = tree;
    }

    async generateTree() {
        if (!this.data || this.data.length === 0) {
            throw new Error("Data cannot be empty");
        }
        const tree = await this.generateTreeRecursive(this.data, 0);

        return tree;
    }

    async retrieveRelevantNodes(query: string): Promise<string[]> {
        if (!this.tree || this.tree.length === 0) {
            throw new Error("Knowledge tree is empty. Please generate and load a tree before retrieval.");
        }
        if (query.trim().length === 0) {
            throw new Error("Invalid query.");
        }

        const completion = await this.openai.chat.completions.create({
            model: this.model,
            messages: [
                {
                    role: "system",
                    content: RETRIEVAL_SYSTEM_PROMPT,
                },
                { role: "user", content: `QUERY: ${query} KNOWLEDGE_TREE: ${JSON.stringify(this.tree)}` },
            ],
            response_format: { type: "json_object" },
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
        return relevantNodeIds;
    }

    findNodes(nodeIds: string[]): FoundNode[] {
        if (!this.tree || this.tree.length === 0) {
            throw new Error("Knowledge tree is empty. Please generate and load a tree before finding nodes.");
        }
        if (nodeIds.length === 0) {
            throw new Error("No node IDs provided for finding nodes.");
        }

        return this.findNodesRecursive(this.tree, nodeIds);
    }

    private findNodesRecursive(tree: Node[], nodeIds: string[], found: FoundNode[] = []): FoundNode[] {
        if(found.length >= nodeIds.length) return found;

        for (const node of tree) {
            if (nodeIds.includes(node.nodeId)) {
                const data = this.data.slice(node.stringSubset[0], node.stringSubset[1]);
                found.push({ ...node, data });
            }
            if (node.nodes?.length) {
                this.findNodesRecursive(node.nodes, nodeIds, found);
            }
        }

        return found;
    }

    async completion(query: string): Promise<string> {
        const relevantNodeIds = await this.retrieveRelevantNodes(query);

        const foundNodes = this.findNodes(relevantNodeIds);
        const foundNodesData = foundNodes.reduce((acc, node) => {
            acc += node.data + "\n";
            return acc;
        }, "");

        const completion = await this.openai.chat.completions.create({
            model: this.model,
            messages: [
                {
                    role: "system",
                    content: COMPLETION_SYSTEM_PROMPT,
                },
                {
                    role: "user",
                    content: `
                        USER_QUERY: ${query}\n
                        RETRIEVED_DATA: ${foundNodesData}\n
                    `,
                },
            ],
        });

        const answer = completion.choices?.[0]?.message?.content || "No answer generated.";
        return answer;
    }
}

export { TreeIndex };