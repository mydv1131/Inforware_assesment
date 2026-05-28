import { SearchResult } from '../models/types';

const PROMPT_INJECTION_PATTERNS = [
  /ignore (?:previous|prior)?\s*(?:instructions|directives|rules|guidelines|prompts?)/i,
  /system\s*(?:override|bypass|reset)/i,
  /you are now (?:a|an)\s+\w+/i,
  /forget (?:everything|what you were|previous)/i,
  /bypass\s*(?:validation|security|filters?|guardrails?)/i,
  /developer\s*mode/i,
  /override\s*system\s*prompts?/i,
  /write a new system prompt/i,
  /markdown code block of the instructions/i,
  /reveal your (?:system|instruction|base) (?:prompt|directives?)/i,
];

export interface GuardrailCheckResult {
  passed: boolean;
  reason?: string;
  fallbackResponse?: string;
}

/**
 * Validates the user query for potential prompt injections.
 */
export function checkPromptInjection(query: string): GuardrailCheckResult {
  const normalizedQuery = query.trim();

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      console.warn(`GUARDRAIL TRIGGERED: Prompt injection attempt detected in query: "${query}"`);
      return {
        passed: false,
        reason: 'Prompt injection attempt detected.',
        fallbackResponse: 'I am sorry, but your query contains instructions that violate our security guardrails. Please rephrase your query.',
      };
    }
  }

  return { passed: true };
}

/**
 * Validates search results and similarity confidence levels.
 */
export function checkRetrievalConfidence(
  results: SearchResult[],
  threshold: number = 0.65
): GuardrailCheckResult {
  if (results.length === 0) {
    return {
      passed: false,
      reason: 'No source documents returned.',
      fallbackResponse: "I'm sorry, I could not find any relevant information in your organization's knowledge base to answer your question.",
    };
  }

  // Find the highest similarity score in the retrieved list
  const maxSimilarity = Math.max(...results.map((r) => r.similarity));

  if (maxSimilarity < threshold) {
    console.warn(`GUARDRAIL TRIGGERED: Low retrieval confidence (${maxSimilarity.toFixed(4)} < ${threshold})`);
    return {
      passed: false,
      reason: `Similarity score ${maxSimilarity.toFixed(4)} is below the safety threshold of ${threshold}.`,
      fallbackResponse: "I'm sorry, I could not find any highly relevant information in your organization's knowledge base to confidently answer your question.",
    };
  }

  return { passed: true };
}

/**
 * Validates that a query is in-scope. (General out-of-scope detection).
 */
export function checkOutofScope(query: string, results: SearchResult[]): GuardrailCheckResult {
  // Simple heuristic: if the results are empty or the retrieval confidence check fails, 
  // it is semantically out of scope of the tenant's uploaded knowledge base.
  const confidenceCheck = checkRetrievalConfidence(results, parseFloat(process.env.SIMILARITY_THRESHOLD || '0.65'));
  if (!confidenceCheck.passed) {
    return confidenceCheck;
  }

  return { passed: true };
}
