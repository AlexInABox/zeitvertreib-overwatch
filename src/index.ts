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

  type Input =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

  const moderate = async (inputs: Input[]) =>
    (
      await openai.moderations.create({
        model: 'omni-moderation-latest',
        input: inputs,
      })
    ).results[0].flagged;

  if (await moderate([{ type: 'text', text: message.cleanContent }])) {
    console.log(`Message flagged: ${message.cleanContent}` + ` by ${message.author.tag}`);
    await message.delete();
    return message.channel.send(`👀`);
  }

  for (const a of message.attachments.values()) {
    if (
      a.contentType?.startsWith('image/') &&
      (await moderate([{ type: 'image_url', image_url: { url: a.url } }]))
    ) {
      console.log(`Image flagged: ${a.url}` + ` by ${message.author.tag}`);
      await message.delete();
      return message.channel.send(`👀`);
    }
  }
});

client.login(process.env.BOT_TOKEN);
