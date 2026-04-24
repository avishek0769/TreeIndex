export default interface Node {
    nodeId: string;
    title: string;
    summary: string;
    stringSubset: [number, number];
    nodes: Node[]
}