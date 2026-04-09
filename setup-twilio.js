require('dotenv').config();
const twilio = require('twilio');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const baseUrl = process.env.BASE_URL;

async function setup() {
  console.log('Configuring Twilio phone number...');
  console.log(`Voice URL: ${baseUrl}/voice/incoming`);
  console.log(`Status URL: ${baseUrl}/voice/status\n`);

  // Find the phone number
  const numbers = await client.incomingPhoneNumbers.list({
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  });

  if (numbers.length === 0) {
    console.error('Phone number not found in your Twilio account!');
    process.exit(1);
  }

  // Update webhook URLs
  await client.incomingPhoneNumbers(numbers[0].sid).update({
    voiceUrl: `${baseUrl}/voice/incoming`,
    voiceMethod: 'POST',
    statusCallback: `${baseUrl}/voice/status`,
    statusCallbackMethod: 'POST',
  });

  console.log(`Phone number ${process.env.TWILIO_PHONE_NUMBER} configured!`);
  console.log('\nYour AI receptionist is LIVE. Call the number to test it!');
}

setup().catch((e) => console.error('Setup failed:', e.message));
