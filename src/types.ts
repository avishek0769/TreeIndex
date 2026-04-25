export interface TreeNode {
    nodeId: string;
    title: string;
    summary: string;
    stringSubset: [number, number];
    nodes: TreeNode[];
}

export interface ConstructorParams {
    baseURL: string;
    apiKey: string;
    model: string;
}

export interface FoundNode {
    nodeId: string;
    title: string;
    summary: string;
    data: string;
}