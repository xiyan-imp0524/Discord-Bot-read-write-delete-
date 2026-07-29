const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.CONVERSATION_LOG_DIR
  ? path.resolve(process.env.CONVERSATION_LOG_DIR)
  : path.join(__dirname, 'logs');

let session = null;

function ensureLogDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function formatTime(date = new Date()) {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function sessionFileName() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `auto-reply-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.md`;
}

function append(text) {
  if (!session) return;
  fs.appendFileSync(session.filePath, text, 'utf8');
}

function startSession({ enabledBy, guildName, channelName, watchedUsers }) {
  ensureLogDir();
  session = {
    filePath: path.join(LOG_DIR, sessionFileName()),
    startedAt: new Date(),
  };

  const userList = watchedUsers
    .map((u) => `- **${u.name}** (\`${u.id}\`)`)
    .join('\n');

  const header = `# Auto-reply conversation log

**Session started:** ${formatTime(session.startedAt)}
**Enabled by:** ${enabledBy.tag} (\`${enabledBy.id}\`)
**Server:** ${guildName}
**Command channel:** #${channelName}
**Watching users (${watchedUsers.length}):**
${userList}

---

`;

  fs.writeFileSync(session.filePath, header, 'utf8');
  console.log(`📋 Conversation log started: ${session.filePath}`);
  return session.filePath;
}

function endSession({ disabledBy } = {}) {
  if (!session) return null;

  const ended = formatTime();
  const by = disabledBy ? ` by **${disabledBy.tag}**` : '';
  append(`\n---\n\n**Session ended:** ${ended}${by}\n`);

  const filePath = session.filePath;
  console.log(`📋 Conversation log closed: ${filePath}`);
  session = null;
  return filePath;
}

function isActive() {
  return Boolean(session);
}

function logUserMessage(message) {
  if (!session) return;

  const name = message.member?.displayName || message.author.globalName || message.author.username;
  const channel = message.channel?.name ? ` · #${message.channel.name}` : '';

  append(`## ${name}${channel} — ${formatTime()}\n\n${message.content?.trim() || '_(no text)_'}\n\n`);
}

function logBotReply({ botName, channelName, content }) {
  if (!session) return;

  const channel = channelName ? ` · #${channelName}` : '';
  append(`## ${botName}${channel} — ${formatTime()}\n\n${content}\n\n---\n\n`);
}

module.exports = {
  startSession,
  endSession,
  isActive,
  logUserMessage,
  logBotReply,
};
