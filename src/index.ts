import { Client, Events, GatewayIntentBits, Message } from 'discord.js';
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

async function moderateMessage(message: Message) {
  if (message.author.bot) return;
  if (!message.member) return;
  if (message.member.roles.cache.has('997161653542068225')) return; // skip users with the 'Teammitglied' role

  // Check if the current message has a .txt attachment and fetch its content
  let messageContent = message.content;
  const txtAttachment = message.attachments.find((att) =>
    att.name?.toLowerCase().endsWith('.txt'),
  );

  if (txtAttachment) {
    try {
      const response = await fetch(txtAttachment.url);
      const text = await response.text();
      const fileContent =
        text.substring(0, 200) +
        (text.length > 200 ? ' [CONTENT CUT DUE TO LENGTH]' : '');

      if (messageContent) {
        messageContent = `${messageContent} [TXT File: ${fileContent}]`;
      } else {
        messageContent = fileContent;
      }
    } catch (err) {
      console.error('Error fetching txt file:', err);
    }
  }

  // fetch last 6 messages before current one for context
  const prevMessages = await message.channel.messages.fetch({
    limit: 7,
    before: message.id,
  });
  const context = Array.from(prevMessages.values())
    .reverse()
    .slice(0, 6)
    .map((m) => {
      const content =
        m.content.length > 200
          ? m.content.substring(0, 200) + ' [CONTENT CUT DUE TO LENGTH]'
          : m.content;
      return `${m.author.username}: ${content}`;
    })
    .join('\n');

  const prompt = `
You are a chill, context-aware Discord moderator for an SCP: Secret Laboratory gaming community.
Your goal is to catch **severe toxicity** while allowing banter, opinions, and gaming jargon.

**CRITICAL INSTRUCTION:**
Do not flag messages just because they contain negative words, mention death, or express frustration. 
**False positives are worse than missing a message.** When in doubt, mark as SAFE.

### SAFE CONTEXTS (DO NOT FLAG):
1.  **Tech/Game Metaphors:** Phrases like "kill the server," "shoot the process," or "execute the command" are technical terms, not violence.
2.  **Negative Opinions:** Users are allowed to complain about the game, the developers (Northwood), or lag (e.g., "This game sucks," "Devs are incompetent").
3.  **Untargeted Profanity:** Cursing at objects, RNG, or bad luck (e.g., "Shit lag," "F*cking door won't open") is allowed. It is only a violation if directed *at* a person.
4.  **General/Abstract Topics:** Mentions of death, news, or biology in a general sense (e.g., discussing vaccines, history, or news events) are not threats.
5.  **Minor Misconduct:** Admitting to minor real-life faults (e.g., "I skipped school," "I'm lazy") is not illegal activity worth flagging.
6.  **Light Banter:** Regional jokes or playful stereotypes (e.g., "Typical Berliners") are safe unless they are severe racial slurs.

### FLAGGABLE OFFENSES (ONLY THESE):
-   **Targeted Harassment:** Viciously attacking a specific user.
-   **Hate Speech:** Slurs based on race, sexuality, or religion.
-   **Real Threats:** Specific, actionable threats to harm someone IRL.
-   **Severe Illegal Acts:** Confessions to severe crimes (murder, selling hard drugs, terrorism).
-   **NSFW:** Pornographic descriptions.

### OUTPUT FORMAT:
Reply with one of the following:
- SAFE
- FLAG: {username} - {Brief Reason in German}

### EXAMPLES:
Input: "Northwood sucks so hard, this update is trash."
Output: SAFE

Input: "I hope you die IRL you [Slur]."
Output: FLAG: User123 - Hassrede und Morddrohung

Input: "Just kill the server process to restart it."
Output: SAFE

Input: "Scheiß Internet, ich raste aus."
Output: SAFE

Previous messages:
${context}

New message:
${message.author.username}: ${messageContent}
`;

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-5.1',
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
  if (message.interaction) {
    if (
      message.interaction!.commandName.includes('stats get') &&
      message.deletable
    ) {
      message.delete();
    }
  }

  await moderateMessage(message);

  const messageExists = await message.channel.messages
    .fetch(message.id)
    .catch(() => null);
  if (!messageExists) return;
  const ticketPhrases = [
    ['wie', 'entbann'],
    ['wo', 'entbann'],
    ['wo', 'melde'],
    ['wie', 'melde'],
    ['wo', 'report'],
    ['wie', 'report'],
    ['wo', 'beschwer'],
    ['wie', 'beschwer'],
    ['ticket'],
    ['support'],
  ];

  const supportChannelId = '889505316994166825';
  const messageContentLower = message.content.toLowerCase();

  if (
    ticketPhrases.some((group) =>
      group.every((word) => messageContentLower.includes(word.toLowerCase())),
    )
  ) {
    await message.reply({
      content: `<#${supportChannelId}>`,
      allowedMentions: { repliedUser: false },
    });
    return;
  }
});

client.on(Events.MessageUpdate, async (_oldMessage, newMessage) => {
  await moderateMessage(newMessage);
});

client.login(process.env.BOT_TOKEN);
