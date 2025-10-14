import { Client, Events, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';
import OpenAI from 'openai';
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

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.member) return;
  //if (message.member.roles.highest.id !== "1263473844908200016") return; // skip vetted users
  if (message.member.roles.cache.has("997161653542068225")) return; // skip users with the 'Teammitglied' role

  // fetch last 3 messages before current one for context
  const prevMessages = await message.channel.messages.fetch({ limit: 4 });
  const context = Array.from(prevMessages.values())
    .reverse()
    .slice(0, 3)
    .map(m => `${m.author.username}: ${m.cleanContent}`)
    .join('\n');

  const prompt = `
You are a moderation model for a Discord server.
Given the previous messages and the new one, decide if the new message
violates community rules (harassment, hate speech, sexual content, threats, illegal activity).
Only flag clear and severe violations.

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
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const verdict = resp.choices[0].message.content?.trim();

    if (verdict && verdict.toUpperCase().includes("FLAG")) {
      console.log(`Flagged: ${message.cleanContent} by ${message.author.tag}`);
      await message.delete();
      
      // Extract explanation after "FLAG:"
      const explanation = verdict.includes(":") 
        ? verdict.substring(verdict.indexOf(":") + 1).trim()
        : "No explanation provided";
      
      await message.channel.send(`👀\n\`\`\`\n${explanation}\n\`\`\``);
    }
  } catch (err) {
    console.error("Moderation error:", err);
  }
});

client.login(process.env.BOT_TOKEN);
