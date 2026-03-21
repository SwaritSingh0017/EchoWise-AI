import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { message, history } = await req.json();

    const priorMessages = (history || []).map((m: { role: string; parts: [{ text: string }] }) => ({
      role: m.role === 'model' ? 'assistant' : 'user',
      content: m.parts[0].text,
    }));

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.1-8b-instruct',
        messages: [
          {
            role: 'system',
            content: `You are EchoWise AI 🌿. Help users with waste reporting, recycling tips, eco rewards and using the EchoWise platform. Keep answers short and friendly.`,
          },
          ...priorMessages,
          { role: 'user', content: message },
        ],
      }),
    });

    const data = await res.json();
    console.log('OpenRouter response:', JSON.stringify(data));
    const reply = data.choices?.[0]?.message?.content ?? 'No response received.';

    return NextResponse.json({ reply });
  } catch (err) {
    console.error('Chat API error:', err);
    return NextResponse.json(
      { reply: 'Sorry, something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}