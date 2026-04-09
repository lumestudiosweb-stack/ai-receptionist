require('dotenv').config();

const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const twilio = require('twilio');

const db = require('./db');
const ai = require('./ai');

const app = express();
const server = http.createServer(app);

// WebSocket server for real-time dashboard updates
const wss = new WebSocketServer({ server });

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Broadcast to all dashboard clients ---
function broadcast(event, data) {
  const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

// --- Twilio Webhook: Incoming call ---
app.post('/voice/incoming', (req, res) => {
  const callSid = req.body.CallSid;
  const callerNumber = req.body.From || 'Unknown';

  console.log(`📞 Incoming call from ${callerNumber} (${callSid})`);

  // Log to database
  db.createCall(callSid, callerNumber);

  // Broadcast to dashboard
  broadcast('call:started', {
    callSid,
    callerNumber,
    status: 'in-progress',
    startedAt: new Date().toISOString(),
  });

  // Respond with TwiML — greet and gather speech input
  const greeting =
    process.env.RECEPTIONIST_GREETING ||
    'Hello! Thank you for calling. How can I help you today?';

  const twiml = new twilio.twiml.VoiceResponse();
  const gather = twiml.gather({
    input: 'speech',
    action: '/voice/respond',
    method: 'POST',
    speechTimeout: 'auto',
    language: 'en-US',
  });
  gather.say({ voice: 'Polly.Joanna' }, greeting);

  // If no input, prompt again
  twiml.say({ voice: 'Polly.Joanna' }, "I didn't catch that. Could you please repeat?");
  twiml.redirect('/voice/incoming');

  // Log the greeting
  db.addMessage(callSid, 'assistant', greeting);
  broadcast('message:new', { callSid, role: 'assistant', content: greeting });

  res.type('text/xml');
  res.send(twiml.toString());
});

// --- Twilio Webhook: Process caller's speech and respond ---
app.post('/voice/respond', async (req, res) => {
  const callSid = req.body.CallSid;
  const speechResult = req.body.SpeechResult;

  console.log(`🗣️  Caller said: "${speechResult}"`);

  // Log caller's message
  db.addMessage(callSid, 'user', speechResult);
  broadcast('message:new', { callSid, role: 'user', content: speechResult });

  try {
    // Generate AI response
    const aiResponse = await ai.generateResponse(callSid, speechResult);
    console.log(`🤖 AI response: "${aiResponse}"`);

    // Log AI response
    db.addMessage(callSid, 'assistant', aiResponse);
    broadcast('message:new', { callSid, role: 'assistant', content: aiResponse });

    // Check if the AI wants to end the call (goodbye detection)
    const isGoodbye =
      /goodbye|bye|have a (great|good|nice) day|take care|thank you for calling/i.test(
        aiResponse
      );

    const twiml = new twilio.twiml.VoiceResponse();

    if (isGoodbye) {
      twiml.say({ voice: 'Polly.Joanna' }, aiResponse);
      twiml.hangup();
    } else {
      const gather = twiml.gather({
        input: 'speech',
        action: '/voice/respond',
        method: 'POST',
        speechTimeout: 'auto',
        language: 'en-US',
      });
      gather.say({ voice: 'Polly.Joanna' }, aiResponse);

      // Timeout fallback
      twiml.say(
        { voice: 'Polly.Joanna' },
        'Are you still there? I want to make sure I can help you.'
      );
      twiml.redirect('/voice/incoming');
    }

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (err) {
    console.error('AI error:', err);

    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say(
      { voice: 'Polly.Joanna' },
      "I'm sorry, I'm having a little trouble right now. Let me transfer you to someone who can help."
    );
    twiml.hangup();

    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// --- Twilio Webhook: Call status updates ---
app.post('/voice/status', async (req, res) => {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;

  console.log(`📊 Call ${callSid} status: ${callStatus}`);

  db.updateCallStatus(callSid, callStatus);
  broadcast('call:status', { callSid, status: callStatus });

  // If call ended, generate summary
  if (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'no-answer') {
    try {
      const analysis = await ai.summarizeCall(callSid);
      db.endCall(callSid, analysis.summary, analysis.intent, analysis.sentiment);
      db.addAction(callSid, 'call_summary', JSON.stringify(analysis));

      broadcast('call:ended', {
        callSid,
        summary: analysis.summary,
        intent: analysis.intent,
        sentiment: analysis.sentiment,
      });

      ai.clearConversation(callSid);
    } catch (err) {
      console.error('Summary error:', err);
      db.endCall(callSid, 'Summary unavailable', 'unknown', 'neutral');
    }
  }

  res.sendStatus(200);
});

// --- Dashboard API endpoints ---

app.get('/api/calls', (req, res) => {
  const calls = db.getRecentCalls(50);
  res.json(calls);
});

app.get('/api/calls/:callSid', (req, res) => {
  const call = db.getCallBySid(req.params.callSid);
  if (!call) return res.status(404).json({ error: 'Call not found' });

  const messages = db.getMessages(req.params.callSid);
  const actions = db.getActions(req.params.callSid);
  res.json({ ...call, messages, actions });
});

app.get('/api/stats', (req, res) => {
  const stats = db.getCallStats();
  res.json(stats);
});

// --- Serve dashboard ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- WebSocket connection ---
wss.on('connection', (ws) => {
  console.log('📺 Dashboard client connected');

  // Send current stats on connect
  const stats = db.getCallStats();
  const recentCalls = db.getRecentCalls(20);
  ws.send(JSON.stringify({ event: 'init', data: { stats, recentCalls } }));

  ws.on('close', () => {
    console.log('📺 Dashboard client disconnected');
  });
});

// --- Start server (async for sql.js init) ---
async function start() {
  await db.getDb(); // Initialize database

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════╗
║         AI RECEPTIONIST - RUNNING            ║
╠══════════════════════════════════════════════╣
║                                              ║
║  Dashboard:  http://localhost:${PORT}           ║
║  Voice URL:  ${process.env.BASE_URL || 'http://localhost:' + PORT}/voice/incoming  ║
║  Status URL: ${process.env.BASE_URL || 'http://localhost:' + PORT}/voice/status    ║
║                                              ║
║  Status: ACTIVE 24/7                         ║
╚══════════════════════════════════════════════╝
    `);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

module.exports = { app, server };
