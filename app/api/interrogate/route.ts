import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { FRANK_SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { checkRateLimit } from '@/lib/rate-limit';

export const maxDuration = 45;
export const dynamic = 'force-dynamic';

function getAIModel() {
  if (process.env.NVIDIA_API_KEY) {
    const nvidia = createOpenAI({
      baseURL: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
      apiKey: process.env.NVIDIA_API_KEY,
    });
    return nvidia(process.env.NVIDIA_MODEL || 'thudm/glm-4-9b-chat');
  }
  if (process.env.OPENAI_API_KEY) {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai(process.env.OPENAI_MODEL || 'gpt-4o');
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic('claude-3-5-sonnet-20241022');
  }
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY) {
    return google('gemini-1.5-pro');
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    if (!checkRateLimit(req, { limit: 30, windowMs: 10 * 60 * 1000 })) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 });
    }
    const { question, reportHeadline, stats, transcriptSample } = await req.json();

    const trimmedQuestion = typeof question === 'string' ? question.trim() : '';

    if (!trimmedQuestion) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    if (trimmedQuestion.length > 500) {
      return NextResponse.json(
        { error: 'Question must be 500 characters or fewer' },
        { status: 400 }
      );
    }

    const model = getAIModel();

    if (model) {
      const prompt = `
You are Frank, the conversational forensic auditor.
The user is asking a follow-up interrogation question about their uploaded chat log:
Chat Overview: ${reportHeadline || 'Chat Forensic Dossier'}
Forensic Metrics: ${JSON.stringify(stats || {}, null, 2)}
Recent Transcript Sample:
${transcriptSample || 'No transcript sample provided.'}

User's Specific Question: "${trimmedQuestion}"

Answer them directly in Frank's authentic voice: brutally perceptive, culturally literate, witty, empathetic yet relentlessly honest. Give them 2-3 paragraphs citing the behavioral patterns. Do not hedge, do not use therapy jargon, and do not encourage delusion.
`;

      const { text } = await generateText({
        model,
        system: FRANK_SYSTEM_PROMPT,
        prompt,
      });

      return NextResponse.json({ answer: text });
    }

    // High-fidelity fallback response when AI key is unavailable
    const qLower = trimmedQuestion.toLowerCase();
    let answer = `Frank's Take: You already know the truth to "${trimmedQuestion}", but you wanted someone outside the situation to state it without cushioning the blow.\n\n`;

    if (qLower.includes('care') || qLower.includes('love') || qLower.includes('feel')) {
      answer += `Look at the math: caring in digital communication is measured in friction. When someone cares, they absorb friction to reply. When someone is lukewarm, they treat answering as a chore to schedule between gym sets and scrolling reels. They didn't hate you; they were simply content to receive your attention without paying for it with their own vulnerability.`;
    } else if (qLower.includes('text') || qLower.includes('reach') || qLower.includes('again')) {
      answer += `Do not send the message. Every time you reach out to break silence, you teach them that their absence carries zero consequences. If you text first, you reset their clock and relieve them of having to wonder about you. Match their silence. If they want to find you, they have your number.`;
    } else {
      answer += `The log shows a clear asymmetry. You are looking for hidden subtext and subtle signals to justify behavior that is actually very simple: people do what they want to do. If someone wanted to see you, plan a dinner, or keep the conversation alive, you wouldn't need a forensic audit to decipher it.`;
    }

    return NextResponse.json({ answer });
  } catch (error) {
    console.error('Interrogate error:', error);
    return NextResponse.json(
      {
        answer:
          "Frank's Take: Stop looking for nuances in their silence. When someone wants to be in your life, they don't leave you guessing. Archive the chat and let them step up.",
      },
      { status: 200 }
    );
  }
}
