# TreeIndex

TreeIndex is a vectorless semantic indexing SDK that converts large text into searchable knowledge trees.

It is inspired by [PageIndex](https://docs.pageindex.ai/), with a simple npm-first developer workflow and bring-your-own-LLM setup.

## How It Works

1. Provide large source text.
2. TreeIndex incrementally builds semantic nodes (topics + subtopics).
3. For a query, it retrieves relevant node IDs.
4. It gathers grounded source snippets from those nodes.
5. It generates an answer from the retrieved context.

## Installation

```bash
npm install treeindex
```

## Quick Start

### 1) Initialize

```ts
import { TreeIndex } from "treeindex";

const treeIndex = new TreeIndex({
    baseURL: "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-5.1",
});
```

### 2) First-time indexing flow (no stored tree yet)

Use this flow when indexing a document for the first time.

```ts
// Load source text
treeIndex.loadData(largeText);

// Build tree from loaded text
const tree = await treeIndex.generateTree();

// Persist the tree in your DB/storage layer
// TreeIndex does not store trees for you.
await saveTreeToDatabase(tree);

// Load the same tree into SDK state for retrieval/answering
treeIndex.loadTree(tree);

// Generate answer
const answer = await treeIndex.generateAnswer("What are assets vs liabilities?");
console.log(answer);
```

### 3) Existing tree flow (already stored in your DB)

Use this flow when the tree already exists in your storage.

```ts
const storedTree = await fetchTreeFromDatabase(documentId);

// loadData is still needed for node text slicing in findNodes()/generateAnswer()
treeIndex.loadData(largeText);
treeIndex.loadTree(storedTree);

const answer = await treeIndex.generateAnswer("What are assets vs liabilities?");
console.log(answer);
```

### 4) Custom answer generation pipeline (advanced)

If you want full control over answer generation logic:

```ts
treeIndex.loadData(largeText);
treeIndex.loadTree(storedTree);

const relevantNodeIds = await treeIndex.retrieveRelevantNodes("What are assets vs liabilities?");
const foundNodes = treeIndex.findNodes(relevantNodeIds);

const context = foundNodes.map((n) => n.data).join("\n");

// Your own generation call (any model/provider)
const answer = await myCustomGenerator({
    query: "What are assets vs liabilities?",
    context,
});

console.log(answer);
```

## Why TreeIndex?

PageIndex-style workflows hit practical friction:

- tree generation can fail on weakly structured input
- local setup can feel heavy
- provider customization can be harder than expected
- only supports PDF input

TreeIndex focuses on a simpler developer experience:

- install with npm and start quickly
- designed to still produce a tree even when source text is poorly structured (with potential accuracy trade-offs)
- bring your own API key and model
- straightforward JavaScript and TypeScript integration

## Supported Providers

TreeIndex works with OpenAI-compatible chat endpoints by supplying the provider base URL and model.

| Provider   | Typical baseURL                                            |
| ---------- | ---------------------------------------------------------- |
| OpenAI     | `https://api.openai.com/v1`                                |
| Gemini     | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| Anthropic  | `https://api.anthropic.com/v1`                             |
| Grok (xAI) | `https://api.x.ai/v1`                                      |
| Ollama     | `http://localhost:11434/v1`                                |
| OpenRouter | `https://openrouter.ai/api/v1`                             |

## API Reference

### `new TreeIndex(options)`

```ts
type TreeIndexOptions = {
    baseURL: string;
    apiKey: string;
    model: string;
};
```

Creates a TreeIndex instance backed by your chosen provider/model.

### `loadData(data: string): void`

Loads source text to index.

### `generateTree(): Promise<TreeNode[]>`

Builds or extends the semantic knowledge tree from loaded data.

```ts
type TreeNode = {
    nodeId: string;
    title: string;
    summary: string;
    stringSubset: [number, number];
    nodes: TreeNode[];
};
```

### `loadTree(tree: TreeNode[]): void`

Loads an existing tree (for reuse or persisted state).

### `retrieveRelevantNodes(query: string): Promise<string[]>`

Returns node IDs that are semantically relevant to the query.

### `findNodes(nodeIds: string[]): FoundNode[]`

Returns matched nodes with extracted source snippets.

```ts
type FoundNode = {
    nodeId: string;
    title: string;
    summary: string;
    data: string; // extracted from loaded data using stringSubset
};
```

### `generateAnswer(query: string): Promise<string>`

Generates an answer grounded in retrieved node data.

## Why Vectorless?

TreeIndex intentionally avoids embedding-first infrastructure:

- more accurate retrieval on long, complex documents where embeddings may struggle to capture nuance
- no embedding pipeline setup required
- no vector database hosting cost
- semantic tree remains human-readable and inspectable
- similar chunks (in vector approach) are not always relevant

## Limitations

- **QUALITY DEPENDS ON MODEL CAPABILITY, ONLY BEST REASONING MODELS WILL WORK WELL**
- long documents may require multiple recursive indexing passes and much more time
- malformed model JSON responses can reduce retrieval quality
- provider/model feature support may vary
- tree persistence is not handled by TreeIndex; you must store and load trees in your own database/storage
- project is early stage and API surface may evolve

## Contributing

Issues and pull requests are welcome.

Please open an issue first so implementation details can be aligned early.

## License

MIT
