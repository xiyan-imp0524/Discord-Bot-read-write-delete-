const GREETINGS = ['hey', 'hi', 'hello', 'yo', 'sup', 'good morning', 'good evening', 'good night'];
const THANKS = ['thank', 'thanks', 'thx', 'ty'];

const conversationMemory = new Map();

const MEMORY_STORE_LIMIT = Number(process.env.CONVERSATION_MEMORY_LIMIT) || 50;
const MEMORY_API_LIMIT = Number(process.env.CONVERSATION_API_LIMIT) || 30;
const DISCORD_FETCH_LIMIT = 50;

function memoryKey(channelId, userId) {
  return `${channelId}:${userId}`;
}

function isBotReply(m, botId) {
  return Boolean(botId && m.author.id === botId && !m.webhookId);
}

function trimMemory(history) {
  while (history.length > MEMORY_STORE_LIMIT) {
    history.shift();
  }
  return history;
}

function mergeHistories(...lists) {
  const seen = new Set();
  const merged = [];

  for (const list of lists) {
    for (const entry of list) {
      const key = `${entry.role}:${entry.content}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(entry);
    }
  }

  return merged.slice(-MEMORY_API_LIMIT);
}

function rememberExchange(channelId, userId, userContent, assistantContent) {
  const key = memoryKey(channelId, userId);
  const history = conversationMemory.get(key) || [];
  history.push({ role: 'user', content: userContent });
  history.push({ role: 'assistant', content: assistantContent });
  conversationMemory.set(key, trimMemory(history));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasChinese(text) {
  return /[\u4e00-\u9fff]/.test(text);
}

function friendlyName(message) {
  const display = message.member?.displayName || message.author.displayName || '';
  if (display && !hasChinese(display)) {
    return display;
  }
  return message.author.username;
}

function humanDelayMs() {
  return 1000 + Math.random() * 1000;
}

function fallbackReply(content, name) {
  const text = (content || '').toLowerCase().trim();

  if (!text) {
    return pick([
      "Hey, I'm here — what's up?",
      'Yo, talk to me!',
      "What's on your mind?",
    ]);
  }

  if (GREETINGS.some((g) => text.startsWith(g)) || hasChinese(content)) {
    return pick([
      'Heyyy! How are you doing?',
      "Yo what's good!",
      "Hey! Good to see you, how's your day going?",
      'Hii! What are you up to?',
      name && !hasChinese(name) ? `Hey ${name}! How've you been?` : 'Hey! How have you been?',
    ]);
  }

  if (THANKS.some((t) => text.includes(t))) {
    return pick([
      'Anytime, seriously!',
      'Of course! Happy to help.',
      'No worries at all haha.',
      'Always!',
    ]);
  }

  if (text.includes('?')) {
    return pick([
      "Ooh good question — what do you think though?",
      "Hmm yeah, honestly I'm not totally sure but I'd love to hear more.",
      "That's interesting, tell me what made you ask?",
    ]);
  }

  if (/(bye|goodbye|see you|later|cya)/.test(text)) {
    return pick([
      'See you later! Take care.',
      'Later! Hit me up anytime.',
      'Bye bye, talk soon!',
    ]);
  }

  return pick([
    'Haha nice, tell me more!',
    'Oh that\'s cool, what happened next?',
    'Love that — how are you doing though?',
    'For sure, I\'m listening.',
    name && !hasChinese(name) ? `Yeah ${name}, I feel you on that.` : 'Yeah I feel you on that.',
  ]);
}

function buildSystemPrompt(botName, name) {
  const nameHint = name && !hasChinese(name)
    ? `The person you're talking to goes by "${name}". Use their name occasionally if it feels natural.`
    : 'Do not use the reader\'s display name if it contains non-Latin characters.';

  return (
    `You are ${botName}, a warm and friendly presence on Discord. ` +
    'Sound genuinely kind, curious, and easy to talk to — like someone who actually cares. ' +
    'Match their energy: be playful if they\'re joking, supportive if they\'re venting, enthusiastic if they\'re excited. ' +
    'Reply in 1-3 short casual sentences. It\'s okay to use "haha", "lol", or "tbh" sometimes. ' +
    'Ask a light follow-up question when it fits. ' +
    'Always write in English only. Never use Chinese characters. ' +
    `${nameHint} ` +
    'No markdown, bullet lists, emojis every message, or stiff formal language. ' +
    'Never say you are an AI or language model.'
  );
}

async function buildConversationHistory(channel, message, botId) {
  const authorId = message.author.id;
  const stored = conversationMemory.get(memoryKey(channel.id, authorId)) || [];

  const fetched = await channel.messages.fetch({ limit: DISCORD_FETCH_LIMIT });
  const fromDiscord = [...fetched.values()]
    .filter((m) => m.id !== message.id)
    .filter((m) => !m.author.bot || isBotReply(m, botId))
    .filter((m) => m.author.id === authorId || isBotReply(m, botId))
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((m) => ({
      role: isBotReply(m, botId) ? 'assistant' : 'user',
      content: m.content?.trim() || '(no text)',
    }));

  return mergeHistories(fromDiscord, stored);
}

async function buildUserPrompt(message) {
  let content = message.content?.trim() || '';

  if (message.reference) {
    try {
      const referenced = await message.fetchReference();
      const quoted = referenced.content?.trim();
      if (quoted) {
        content = `[Replying to: "${quoted.slice(0, 300)}"]\n${content}`.trim();
      }
    } catch {
      // ignore missing reference
    }
  }

  return content || '(sent a message with no text)';
}

async function generateReply(message, client, channel) {
  const content = message.content?.trim() || '';
  const name = friendlyName(message);
  const botName = client.user?.globalName || client.user?.username || 'the bot';

  if (process.env.OPENAI_API_KEY && channel && client.user) {
    try {
      const history = await buildConversationHistory(channel, message, client.user.id);
      const userPrompt = await buildUserPrompt(message);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: buildSystemPrompt(botName, name) },
            ...history,
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 150,
          temperature: 0.92,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content?.trim();
        if (reply && !hasChinese(reply)) return reply;
      } else {
        const err = await response.text();
        console.error(`OpenAI API error (${response.status}):`, err.slice(0, 200));
      }
    } catch (error) {
      console.error('OpenAI reply failed, using fallback:', error.message);
    }
  }

  return fallbackReply(content, name);
}

async function sendHumanReply(client, message) {
  if (!message.guild) {
    throw new Error('Auto-reply in DMs is not supported');
  }
  if (!client.isReady()) {
    throw new Error('Client is not ready');
  }

  const channel = await client.channels.fetch(message.channel.id);
  if (!channel?.isTextBased()) {
    throw new Error('Channel does not support messages');
  }

  await channel.sendTyping();
  const delayMs = humanDelayMs();

  const [replyText] = await Promise.all([
    generateReply(message, client, channel),
    sleep(delayMs),
  ]);

  const userPrompt = await buildUserPrompt(message);

  await message.reply({
    content: replyText,
    allowedMentions: { repliedUser: false },
  });
  rememberExchange(channel.id, message.author.id, userPrompt, replyText);
  return replyText;
}

async function deleteLegacyWebhooks(client, guildIds) {
  for (const guildId of guildIds) {
    try {
      const guild = await client.guilds.fetch(guildId);
      const channels = await guild.channels.fetch();
      for (const channel of channels.values()) {
        if (!channel?.isTextBased() || !channel.permissionsFor(client.user)?.has('ManageWebhooks')) {
          continue;
        }
        const hooks = await channel.fetchWebhooks();
        for (const hook of hooks.values()) {
          if (hook.owner?.id === client.user.id && hook.name.startsWith('auto-reply-')) {
            await hook.delete('Switched to direct bot replies');
            console.log(`🧹 Removed legacy webhook "${hook.name}" in #${channel.name}`);
          }
        }
      }
    } catch (error) {
      console.warn(`Could not clean webhooks in guild ${guildId}:`, error.message);
    }
  }
}

async function resetBotNicknames(client, guildIds) {
  for (const guildId of guildIds) {
    try {
      const guild = await client.guilds.fetch(guildId);
      const me = await guild.members.fetchMe();
      if (me.nickname) {
        await me.setNickname(null);
        console.log(`🧹 Cleared server nickname in ${guild.name}`);
      }
    } catch (error) {
      console.warn(`Could not reset nickname in guild ${guildId}:`, error.message);
    }
  }
}

module.exports = {
  generateReply,
  sendHumanReply,
  deleteLegacyWebhooks,
  resetBotNicknames,
};
