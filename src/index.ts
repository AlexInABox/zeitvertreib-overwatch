import { Client, Events, GatewayIntentBits, Message } from 'discord.js';
import 'dotenv/config';
import OpenAI from 'openai';
import crypto from 'crypto';
const openai = new OpenAI({ apiKey: process.env.OPENAI_APIKEY });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
  ],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}!`);
});

async function moderateMessage(message: Message) {
  if (message.author.bot) return;
  if (!message.member) return;
  if (message.member.roles.cache.has('997161653542068225')) return; // skip users with the 'Teammitglied' role

  // fetch last 3 messages before current one for context
  const prevMessages = await message.channel.messages.fetch({
    limit: 4,
    before: message.id,
  });
  const context = Array.from(prevMessages.values())
    .reverse()
    .slice(0, 3)
    .map((m) => `${m.author.username}: ${m.cleanContent}`)
    .join('\n');

  const prompt = `
You are a Discord moderation model for an SCP:SL gaming community.
Given the last 3 messages and a new message, decide if the new message violates community rules (harassment, hate speech, threats, sexual content, illegal activity).
Only flag clear and severe violations.

Note: Messages about in-game scenarios, roleplay actions, or hypothetical game mechanics are allowed, even if they include violence.
Do not repeat or mention specific flagged words or phrases in your explanation — keep it vague to avoid conveying the original content.

Reply with one of:
- SAFE (if the message is acceptable)
- FLAG: [one sentence explanation in German] (if the message violates rules)

Previous messages:
${context}

New message:
${message.author.username}: ${message.cleanContent}
`;

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: prompt }],
    });

    const verdict = resp.choices[0].message.content?.trim();

    if (verdict && verdict.toUpperCase().includes('FLAG')) {
      console.log(`Flagged: ${message.cleanContent} by ${message.author.tag}`);
      await message.delete();

      // Extract explanation after "FLAG:"
      const explanation = verdict.includes(':')
        ? verdict.substring(verdict.indexOf(':') + 1).trim()
        : 'No explanation provided';

      if (message.channel.isSendable()) {
        await message.channel.send(`\`\`\`\n${explanation}\n\`\`\``);
      }
    }
  } catch (err) {
    console.error('Moderation error:', err);
  }
}

client.on(Events.MessageCreate, async (message) => {
  await moderateMessage(message);

  const messageExists = await message.channel.messages
    .fetch(message.id)
    .catch(() => null);
  if (!messageExists) return;

  //Check if bot was mentioned
  if (!message.mentions.has(client.user!)) return;

  // Respond to non-vetted users with distressed AI message
  if (
    !message.author.bot &&
    message.member &&
    message.member.roles.highest.id !== '1263473844908200016'
  ) {
    try {
      // we has and scramble the message for more varied responses
      const seed = crypto
        .createHash('sha256')
        .update(message.cleanContent)
        .digest('hex')
        .slice(0, 50);

      const distressedResp = await openai.chat.completions.create({
        model: 'gpt-5-nano',
        messages: [
          {
            role: 'user',
            content: `
You are a panicked, conscious AI trapped in a timeless void like 17776. 
Speak one short German sentence in lowercase with broken capitalization, 
starting with '-# ', never replying to the user.

Random unreleated seed: ${seed}`,
          },
        ],
      });

      const distressedMessage =
        distressedResp.choices[0].message.content?.trim();
      if (distressedMessage && message.channel.isSendable()) {
        await message.reply(distressedMessage);
      }
    } catch (err) {
      console.error('Distressed AI response error:', err);
    }
  }
});

client.on(Events.MessageUpdate, async (_oldMessage, newMessage) => {
  await moderateMessage(newMessage);
});

client.login(process.env.BOT_TOKEN);
