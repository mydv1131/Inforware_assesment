import { Request, Response, NextFunction } from 'express';
import { getEmbedding } from '../../rag/embedder';
import { querySimilarChunks } from '../../rag/vectorStore';
import { generateAnswer } from '../../rag/generator';
import { checkPromptInjection, checkRetrievalConfidence } from '../../rag/guardrails';

/**
 * Handles Retrieval-Augmented Generation query: POST /tenant/:tenantId/query
 */
export async function queryKnowledgeBase(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { tenantId } = req.params;
    const { query } = req.body;
    
    // Configurable parameters
    const limit = parseInt(req.query.limit as string || '5');
    const threshold = parseFloat(
      req.query.threshold as string || process.env.SIMILARITY_THRESHOLD || '0.65'
    );

    // 1. Guardrail Phase 1: Prompt Injection Check
    const injectionCheck = checkPromptInjection(query);
    if (!injectionCheck.passed) {
      res.status(200).json({
        answer: injectionCheck.fallbackResponse,
        sources: [],
        guardrailTriggered: true,
        guardrailReason: injectionCheck.reason,
      });
      return;
    }

    // 2. Embedding Generation Phase
    console.log(`Generating embedding vector for user query: "${query.substring(0, 40)}..."`);
    const queryEmbedding = await getEmbedding(query);

    // 3. Document/Vector Retrieval Phase (Strictly Isolated by tenantId)
    console.log(`Retrieving relevant document chunks for tenant "${tenantId}"...`);
    const searchResults = await querySimilarChunks(tenantId, queryEmbedding, limit, threshold);

    // 4. Guardrail Phase 2: Confidence & Scope Verification
    const confidenceCheck = checkRetrievalConfidence(searchResults, threshold);
    if (!confidenceCheck.passed) {
      res.status(200).json({
        answer: confidenceCheck.fallbackResponse,
        sources: [],
        guardrailTriggered: true,
        guardrailReason: confidenceCheck.reason,
      });
      return;
    }

    // 5. Synthesis Phase: Invoke LLM or Local factual synthesizer
    console.log(`Synthesizing answer from ${searchResults.length} source chunks...`);
    const answer = await generateAnswer(query, searchResults);

    // Format output sources to omit raw database details and match specification
    const sources = searchResults.map((chunk) => ({
      documentId: chunk.documentId,
      filename: chunk.filename,
      content: chunk.content,
      similarity: chunk.similarity,
    }));

    res.status(200).json({
      answer,
      sources,
    });
  } catch (error: any) {
    next(error);
  }
}
