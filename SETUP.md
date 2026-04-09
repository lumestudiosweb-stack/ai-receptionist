# AI Receptionist - Setup Guide

## What This Does
An AI-powered phone receptionist that answers calls 24/7, has natural conversations with callers using Claude AI, and shows everything on a real-time dashboard.

## Prerequisites
- Node.js 18+ installed
- A Twilio account (for phone calls)
- An Anthropic API key (for Claude AI)

---

## Step 1: Install Dependencies

```bash
cd "ai receptionist"
npm install
```

## Step 2: Get Your API Keys

### Twilio (handles phone calls)
1. Sign up at https://www.twilio.com/try-twilio
2. Get a phone number from the Twilio console
3. Copy your **Account SID** and **Auth Token** from the dashboard

### Anthropic (AI brain)
1. Sign up at https://console.anthropic.com
2. Create an API key

## Step 3: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your actual keys:
```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1234567890
ANTHROPIC_API_KEY=sk-ant-xxxxx
PORT=3000
BASE_URL=https://your-domain.ngrok-free.app
BUSINESS_NAME=My Business
BUSINESS_HOURS=9AM - 5PM, Monday to Friday
RECEPTIONIST_GREETING=Hello! Thank you for calling My Business. How can I help you today?
```

## Step 4: Expose Your Server (for Twilio webhooks)

Twilio needs to reach your server. Use ngrok for development:

```bash
# Install ngrok: https://ngrok.com/download
ngrok http 3000
```

Copy the `https://xxxx.ngrok-free.app` URL and put it in your `.env` as `BASE_URL`.

## Step 5: Configure Twilio Webhooks

1. Go to Twilio Console > Phone Numbers > Your Number
2. Under "Voice & Fax", set:
   - **A CALL COMES IN**: Webhook → `https://your-ngrok-url/voice/incoming` (POST)
   - **CALL STATUS CHANGES**: `https://your-ngrok-url/voice/status` (POST)
3. Save

## Step 6: Start the Server

```bash
# Development
npm start

# Production (24/7 with auto-restart)
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup    # auto-start on system boot
```

## Step 7: Open the Dashboard

Go to `http://localhost:3000` in your browser.

---

## How It Works

```
Caller dials your Twilio number
        |
        v
Twilio sends webhook to your server (/voice/incoming)
        |
        v
Server greets caller using text-to-speech
        |
        v
Caller speaks → Twilio transcribes → sends to server (/voice/respond)
        |
        v
Claude AI generates a natural response
        |
        v
Response is spoken back to caller via text-to-speech
        |
        v
Everything logged to database + pushed to dashboard in real-time
```

## Dashboard Features
- **Live call monitoring** - see active calls in real-time
- **Activity feed** - every message between caller and AI
- **Call history** - browse all past calls with transcripts
- **Analytics** - call counts, duration, sentiment analysis
- **Call details** - click any call to see full transcript + AI analysis

## Production Deployment

For a production setup, deploy to a cloud server (e.g., DigitalOcean, AWS, Railway):

1. Deploy your code to the server
2. Set environment variables
3. Run with PM2: `pm2 start ecosystem.config.js`
4. Point Twilio webhooks to your server's public URL
5. The AI receptionist will run 24/7 with auto-restart
