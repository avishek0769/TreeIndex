import OpenAI from "openai";
import { sampleData } from "./sample_data"

const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_KEY
})

const SYSTEM_PROMPT = `

`

async function generateKnowledgeTree () {
    
}

generateKnowledgeTree()