require('dotenv').config();
const Groq = require('groq-sdk');

async function test() {
  console.log('Testing Groq API (Llama 3.3 70B)...\n');
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 100,
    messages: [
      { role: 'system', content: 'You are a receptionist for My Business. Keep it to 1-2 sentences.' },
      { role: 'user', content: 'Hi, I want to book an appointment for next Monday.' },
    ],
  });

  console.log('AI Receptionist:', res.choices[0].message.content);
  console.log('\n--- API working! Server is ready. ---');
}

test().catch((e) => console.error('ERROR:', e.message));
