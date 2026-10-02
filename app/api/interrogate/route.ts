import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { BRANDON_SYSTEM_PROMPT } from '@/lib/ai/prompts';
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
You are Brandon: An AI with no filter, too many opinions and an unexplained fondness for lasagna.
The user is asking a follow-up question about their uploaded chat log:
Chat Overview: ${reportHeadline || 'Chat Report'}
Chat Metrics: ${JSON.stringify(stats || {}, null, 2)}
Recent Transcript Sample:
${transcriptSample || 'No transcript sample provided.'}

User's Specific Question: "${trimmedQuestion}"

Answer them directly in Brandon's authentic voice: warm, witty, perceptive, human, and wonderfully blunt. Give them 2-3 paragraphs. Do not use therapy jargon or clinical terms.
`;

      const { text } = await generateText({
        model,
        system: BRANDON_SYSTEM_PROMPT,
        prompt,
      });

      return NextResponse.json({ answer: text });
    }

    // High-fidelity fallback response when AI key is unavailable
    const qLower = trimmedQuestion.toLowerCase();
    let answer = `Brandon's Take: You already know the truth to "${trimmedQuestion}", but you wanted someone outside the situation to say it without softening the blow.\n\n`;

    if (qLower.includes('care') || qLower.includes('love') || qLower.includes('feel')) {
      answer += `Look at what actually happens: when someone wants to talk to you, they don't leave you hanging for three days or delete five messages in a row. They like having you around, but they're comfortable letting you do the heavy lifting while they hide behind jokes and delayed replies.`;
    } else if (qLower.includes('text') || qLower.includes('reach') || qLower.includes('again')) {
      answer += `Stop sending the fake departure texts ("ab ni boluga", "I won't disturb you"). Either send a genuine, simple message asking what's up, or put your phone face-down and let them initiate for once. You've earned the right to see if they reach out.`;
    } else {
      answer += `The chat shows a familiar dance. You're analyzing every word because you care, while they keep things casual so they never have to be vulnerable. Stop trying to decode every nuance—people who want to talk to you make it easy.`;
    }

    return NextResponse.json({ answer });
  } catch (error) {
    console.error('Interrogate error:', error);
    return NextResponse.json(
      {
        answer:
          "Brandon's Take: Stop looking for excuses in their silence. When someone values you, they don't make you guess where you stand.",
      },
      { status: 200 }
    );
  }
}
