export interface Node {
    nodeId: string;
    title: string;
    summary: string;
    stringSubset: [number, number];
    nodes: Node[]
}

export interface FoundNodeData {
    nodeId: string;
    title: string;
    summary: string;
    data: string;
}