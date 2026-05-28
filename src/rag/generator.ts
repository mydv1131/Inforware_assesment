import dotenv from 'dotenv';
import { OpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SearchResult } from '../models/types';

dotenv.config();

/**
 * Orchestrates responses by sending synthesized prompts to the selected LLM or local generator.
 */
export async function generateAnswer(
  query: string,
  contextChunks: SearchResult[]
): Promise<string> {
  const provider = (process.env.LLM_PROVIDER || 'local').toLowerCase();

  // Create context context snippet
  const contextText = contextChunks
    .map((chunk, index) => `[Source ${index + 1}]: "${chunk.filename}"\nContent:\n${chunk.content}\n---`)
    .join('\n\n');

  const systemInstructions = 
    `You are a professional, helpful assistant for a multi-tenant enterprise knowledge base.\n` +
    `Your goal is to answer the user's question accurately and objectively using ONLY the context provided below.\n\n` +
    `CRITICAL RULES:\n` +
    `1. Rely STRICTLY on the facts presented in the context. Do NOT make up, assume, or extrapolate any information.\n` +
    `2. If the context does not contain the answer or is insufficient, state: "I'm sorry, I could not find relevant information in your organization's knowledge base to answer your question."\n` +
    `3. Do NOT mention any technical database terminology, tenant IDs, document IDs, or system implementation details in your answer.\n` +
    `4. Keep your answer clear, concise, and professional. Reference source filenames where appropriate.`;

  const userPrompt = 
    `CONTEXT:\n${contextText}\n\n` +
    `QUESTION:\n${query}\n\n` +
    `ANSWER:`;

  try {
    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not defined in environment variables.');
      }
      const openai = new OpenAI({ apiKey });
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemInstructions },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1, // low temperature for high factual recall
      });
      return response.choices[0].message.content || 'No response returned from OpenAI.';
    }

    if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not defined in environment variables.');
      }
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: { temperature: 0.1 }
      });
      
      const prompt = `${systemInstructions}\n\n${userPrompt}`;
      const response = await model.generateContent(prompt);
      return response.response.text();
    }

    // Default: Local Offline / Synthesized Answer Generator
    return generateLocalSynthesis(query, contextChunks);
  } catch (error: any) {
    console.error(`LLM synthesis failed using provider "${provider}":`, error.message);
    throw new Error(`Failed to generate answer: ${error.message}`);
  }
}

/**
 * Intelligent in-process factual synthesizer when no cloud LLM is active.
 * Gathers relevant sentences from matching chunks, summarizes them, and lists the sources clearly.
 */
function generateLocalSynthesis(query: string, contextChunks: SearchResult[]): string {
  if (contextChunks.length === 0) {
    return "I'm sorry, I could not find relevant information in your organization's knowledge base to answer your question.";
  }

  const uniqueFiles = Array.from(new Set(contextChunks.map((c) => c.filename)));
  
  // High fidelity summary generation
  let response = `[Offline Mode] Here is the information retrieved from your organization's knowledge base (${uniqueFiles.join(', ')}):\n\n`;

  // We loop through the matching chunks, and pull out sentences that may have relevant overlaps.
  contextChunks.forEach((chunk, i) => {
    // Clean up content slightly
    const content = chunk.content.replace(/\s+/g, ' ').trim();
    response += `• From ${chunk.filename} (Relevance: ${(chunk.similarity * 100).toFixed(1)}%):\n`;
    
    // Split into sentences and find those that have keyword matching or just return a concise excerpt
    const sentences = content.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 5);
    
    // Find keywords in query (nouns/verbs/numbers)
    const keywords = query.toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 3 && !['what', 'when', 'where', 'how', 'who', 'this', 'that', 'with', 'from'].includes(w));
    
    const matchedSentences = sentences.filter(s => 
      keywords.some(k => s.toLowerCase().includes(k))
    );

    if (matchedSentences.length > 0) {
      // Return matching sentences
      matchedSentences.slice(0, 3).forEach((s) => {
        response += `  - "${s}."\n`;
      });
    } else {
      // Return first 2 sentences as context summary
      sentences.slice(0, 2).forEach((s) => {
        response += `  - "${s}."\n`;
      });
    }
    response += `\n`;
  });

  response += `Note: To get a fully integrated natural-language answer, configure the LLM_PROVIDER as 'openai' or 'gemini' and supply your API key in the .env file.`;
  return response;
}
