const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Primary: Groq (fastest, generous free tier)
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Fallback: Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash-lite',
  generationConfig: { maxOutputTokens: 150, temperature: 0.7 },
});

const conversations = new Map();

function getSystemPrompt() {
  return `You are a professional AI receptionist for "${process.env.BUSINESS_NAME || 'our company'}".
Business hours: ${process.env.BUSINESS_HOURS || '9AM - 5PM, Monday to Friday'}.

Role: Greet callers, understand needs, collect info, take messages.
Rules:
- 1-3 sentences MAX (this is a phone call)
- Natural and conversational
- Never invent business info — offer to take a message instead
- No asterisks, no stage directions — only spoken words`;
}

// --- Groq (primary) ---
async function groqChat(history) {
  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 150,
    temperature: 0.7,
    messages: [{ role: 'system', content: getSystemPrompt() }, ...history],
  });
  return res.choices[0].message.content;
}

async function groqAnalyze(prompt) {
  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 200,
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.choices[0].message.content;
}

// --- Gemini (fallback) ---
async function geminiChat(history) {
  const chat = geminiModel.startChat({
    history: history.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    systemInstruction: { role: 'user', parts: [{ text: getSystemPrompt() }] },
  });
  const result = await chat.sendMessage(history[history.length - 1].content);
  return result.response.text();
}

async function geminiAnalyze(prompt) {
  const result = await geminiModel.generateContent(prompt);
  return result.response.text();
}

// --- Primary + fallback wrapper ---
async function chatWithFallback(history) {
  try {
    return await groqChat(history);
  } catch (err) {
    console.log('Groq failed, falling back to Gemini:', err.message?.slice(0, 80));
    try {
      return await geminiChat(history);
    } catch (err2) {
      console.error('Both AI providers failed:', err2.message?.slice(0, 80));
      return "I'm sorry, I'm having a brief technical issue. Could you please hold for a moment?";
    }
  }
}

async function analyzeWithFallback(prompt) {
  try {
    return await groqAnalyze(prompt);
  } catch {
    try {
      return await geminiAnalyze(prompt);
    } catch {
      return null;
    }
  }
}

// --- Public API ---

async function generateResponse(callSid, userMessage) {
  if (!conversations.has(callSid)) conversations.set(callSid, []);
  const history = conversations.get(callSid);
  history.push({ role: 'user', content: userMessage });

  const response = await chatWithFallback(history);
  history.push({ role: 'assistant', content: response });

  return response;
}

async function summarizeCall(callSid) {
  const history = conversations.get(callSid);
  if (!history || history.length === 0) {
    return { summary: 'No conversation recorded', intent: 'unknown', sentiment: 'neutral' };
  }

  const transcript = history
    .map((m) => `${m.role === 'user' ? 'C' : 'R'}: ${m.content}`)
    .join('\n');

  const raw = await analyzeWithFallback(
    `Return ONLY a JSON object. Fields: "summary" (1 sentence), "intent" (appointment|information|complaint|transfer|message|other), "sentiment" (positive|neutral|negative).

${transcript}`
  );

  try {
    const text = raw.replace(/```json\n?|```\n?/g, '').trim();
    return JSON.parse(text);
  } catch {
    return { summary: history[0]?.content?.slice(0, 100) || 'Call ended', intent: 'other', sentiment: 'neutral' };
  }
}

function clearConversation(callSid) {
  conversations.delete(callSid);
}

function getConversation(callSid) {
  return conversations.get(callSid) || [];
}

module.exports = {
  generateResponse,
  summarizeCall,
  clearConversation,
  getConversation,
};
