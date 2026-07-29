require('dotenv').config();
if (process.env.BOT_TOKEN) {
  process.env.BOT_TOKEN = process.env.BOT_TOKEN.trim();
}
if (process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY.trim();
}

const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  getVoiceConnection,
} = require('@discordjs/voice');

const path = require('path');
const fs = require('fs');
const {
  sendUserNotification,
  messagePreview,
  stripMentions,
  getGuildMessageRecipients,
} = require('./notify');
const { sendHumanReply, deleteLegacyWebhooks, resetBotNicknames } = require('./reply');
const conversationLog = require('./conversationLog');
const { loadAutoReplyEnabled, saveAutoReplyEnabled } = require('./autoReplyState');

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.DirectMessages,
  GatewayIntentBits.GuildVoiceStates,
];
if (process.env.MESSAGE_CONTENT_INTENT === 'true') {
  intents.push(GatewayIntentBits.MessageContent);
}

const client = new Client({ intents });

const ALLOWED_GUILD_IDS = process.env.GUILD_IDS
  ? process.env.GUILD_IDS.split(',').map((id) => id.trim())
  : [];
const ALLOWED_USERS = process.env.ALLOWED_USERS
  ? process.env.ALLOWED_USERS.split(',').map((id) => id.trim())
  : [];
const NOTIFY_USERS = process.env.NOTIFY_USERS
  ? process.env.NOTIFY_USERS.split(',').map((id) => id.trim())
  : [];
const AUTO_REPLY_USERS = process.env.AUTO_REPLY_USERS
  ? process.env.AUTO_REPLY_USERS.split(',').map((id) => id.trim())
  : [];

const replyCooldown = new Map();
const replyInProgress = new Set();
const REPLY_COOLDOWN_MS = 4000;
let autoReplyReady = false;
let autoReplyEnabled = false;

// Slash commands definition
const commands = [
  new SlashCommandBuilder()
    .setName('cute')
    .setDescription('Deletes the last 100 messages in this channel')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play an audio file from the songs folder')
    .addStringOption((option) =>
      option.setName('file').setDescription('Name of the audio file (e.g. song.mp3)').setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playing and leave the voice channel')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('tell')
    .setDescription('Send a private notification to another allowed user')
    .addUserOption((option) =>
      option.setName('user').setDescription('User to notify').setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('message').setDescription('Your message').setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('auto')
    .setDescription('Enable or disable auto-reply for AUTO_REPLY_USERS in this server')
    .addBooleanOption((option) =>
      option.setName('enabled').setDescription('Turn auto-reply on or off').setRequired(true)
    )
    .addBooleanOption((option) =>
      option.setName('logging').setDescription('Also save conversation log to a file').setRequired(false)
    )
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  if (NOTIFY_USERS.length) {
    console.log(`🔔 Targeted notifications enabled for ${NOTIFY_USERS.length} user(s).`);
  }
  if (AUTO_REPLY_USERS.length) {
    autoReplyEnabled = loadAutoReplyEnabled();
    console.log(`💬 Auto-reply configured for ${AUTO_REPLY_USERS.length} user(s).`);
    console.log(`🤖 Replies will appear as ${client.user.tag}`);
    console.log(autoReplyEnabled
      ? '✅ Auto-reply is ON'
      : '⏸️ Auto-reply is OFF — run /auto with enabled: True to turn on');
    if (process.env.OPENAI_API_KEY) {
      console.log(`🧠 AI replies enabled (${process.env.OPENAI_MODEL || 'gpt-4o-mini'})`);
    } else {
      console.log('📝 Using built-in replies (set OPENAI_API_KEY for smarter responses)');
    }
    resetBotNicknames(client, ALLOWED_GUILD_IDS).catch((e) => console.warn(e.message));
    deleteLegacyWebhooks(client, ALLOWED_GUILD_IDS).catch((e) => console.warn(e.message));
  }

  autoReplyReady = true;

  try {
    console.log('🔄 Registering slash commands...');
    for (const guildId of ALLOWED_GUILD_IDS) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guildId),
        { body: commands }
      );
    }
    console.log('✅ Slash commands registered.');
  } catch (error) {
    console.error('❌ Failed to register slash commands:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const deferredCommands = ['cute', 'play', 'tell', 'auto', 'stop'];
  const shouldDefer = deferredCommands.includes(interaction.commandName);
  let deferred = false;

  if (shouldDefer) {
    try {
      await interaction.deferReply({ ephemeral: true });
      deferred = true;
    } catch (error) {
      console.error(`Failed to acknowledge /${interaction.commandName}:`, error.message);
      if (!client.isReady()) scheduleReconnect('interaction while offline');
      return;
    }
  }

  try {
    if (!interaction.guild) {
      const msg = '❌ This command only works in a server.';
      return deferred ? interaction.editReply(msg) : interaction.reply({ content: msg, ephemeral: true });
    }
    if (!ALLOWED_GUILD_IDS.includes(interaction.guild.id)) {
      const msg = '❌ This command is not allowed in this server.';
      return deferred
        ? interaction.editReply(msg)
        : interaction.reply({ content: msg, ephemeral: true });
    }

    if (!ALLOWED_USERS.includes(interaction.user.id)) {
      const msg = `❌ You are not allowed to use this command.\nYour ID: \`${interaction.user.id}\` — add it to ALLOWED_USERS in .env`;
      return deferred
        ? interaction.editReply(msg)
        : interaction.reply({ content: msg, ephemeral: true });
    }

    if (interaction.commandName === 'tell' && !NOTIFY_USERS.includes(interaction.user.id)) {
      return interaction.editReply('❌ You are not in the notification group.');
    }

    if (interaction.commandName === 'cute') {
      const botPerms = interaction.channel.permissionsFor(interaction.guild.members.me);
      const required = [
        [PermissionFlagsBits.ViewChannel, 'View Channel'],
        [PermissionFlagsBits.ReadMessageHistory, 'Read Message History'],
        [PermissionFlagsBits.ManageMessages, 'Manage Messages'],
      ];

      const missing = required.filter(([perm]) => !botPerms.has(perm)).map(([, name]) => name);
      if (missing.length) {
        return interaction.editReply(`❌ I need these permissions in this channel: **${missing.join(', ')}**`);
      }

      const messages = await interaction.channel.messages.fetch({ limit: 100 });
      const deleted = await interaction.channel.bulkDelete(messages, true);
      await interaction.editReply(`🧹 Deleted **${deleted.size}** message(s).`);
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
    } else if (interaction.commandName === 'play') {
      const voiceChannel = interaction.member.voice.channel;

      if (!voiceChannel) {
        return interaction.editReply('❌ You need to join a **voice channel** first.');
      }

      const fileName = interaction.options.getString('file');
      const filePath = path.join(__dirname, 'songs', fileName);

      if (!fs.existsSync(filePath)) {
        return interaction.editReply(`❌ File **${fileName}** not found in the songs folder.`);
      }

      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
      });

      const player = createAudioPlayer();
      const resource = createAudioResource(filePath);

      connection.subscribe(player);
      player.play(resource);

      player.on(AudioPlayerStatus.Idle, () => {
        connection.destroy();
      });

      await interaction.editReply(`▶️ Now playing **${fileName}**`);
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
    } else if (interaction.commandName === 'stop') {
      const connection = getVoiceConnection(interaction.guild.id);

      if (!connection) {
        return interaction.editReply('❌ The bot is not in a voice channel.');
      }

      connection.destroy();
      await interaction.editReply('⏹️ Stopped and left the voice channel.');
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
    } else if (interaction.commandName === 'tell') {
      const recipient = interaction.options.getUser('user');
      const text = interaction.options.getString('message');

      if (recipient.id === interaction.user.id) {
        return interaction.editReply('❌ You cannot send a notification to yourself.');
      }
      if (!NOTIFY_USERS.includes(recipient.id)) {
        return interaction.editReply('❌ That user is not in the notification group.');
      }

      await sendUserNotification(client, {
        senderUser: interaction.user,
        recipientIds: [recipient.id],
        preview: text,
      });

      await interaction.editReply(`✅ Notification sent to **${recipient.tag}**.`);
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
    } else if (interaction.commandName === 'auto') {
      if (!AUTO_REPLY_USERS.length) {
        return interaction.editReply('❌ No users in AUTO_REPLY_USERS. Add IDs to `.env` and restart the bot.');
      }

      const wantLogging = interaction.options.getBoolean('logging') ?? false;
      autoReplyEnabled = interaction.options.getBoolean('enabled');
      saveAutoReplyEnabled(autoReplyEnabled);

      if (autoReplyEnabled) {
        let logNote = '';
        if (wantLogging) {
          if (conversationLog.isActive()) {
            conversationLog.endSession({ disabledBy: interaction.user });
          }

          const watchedUsers = await Promise.all(
            AUTO_REPLY_USERS.map(async (id) => {
              try {
                const user = await client.users.fetch(id);
                return { id, name: user.globalName || user.username };
              } catch {
                return { id, name: id };
              }
            })
          );

          const logPath = conversationLog.startSession({
            enabledBy: interaction.user,
            guildName: interaction.guild.name,
            channelName: interaction.channel.name,
            watchedUsers,
          });
          logNote = `\n📋 Logging to \`${path.basename(logPath)}\``;
        }

        await interaction.editReply({
          content: `✅ Auto-reply is now **enabled**.\nI'll auto-respond to **${AUTO_REPLY_USERS.length}** user(s) in AUTO_REPLY_USERS.${logNote}`,
        });
      } else {
        const logPath = conversationLog.endSession({ disabledBy: interaction.user });
        const detail = logPath
          ? `📋 Log saved to \`${path.basename(logPath)}\``
          : 'Messages will not get automatic replies.';

        await interaction.editReply({
          content: `✅ Auto-reply is now **disabled**.\n${detail}`,
        });
      }

      console.log(`⚙️ Auto-reply ${autoReplyEnabled ? 'enabled' : 'disabled'} by ${interaction.user.tag}`);
    }
  } catch (error) {
    console.error(`Error handling /${interaction.commandName}:`, error);
    const message = error.code === 50001
      ? '❌ I cannot access this channel. Give me **View Channel**, **Read Message History**, and **Manage Messages**.'
      : '❌ Something went wrong.';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(message).catch(() => {});
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || message.webhookId) return;

  const authorId = message.author.id;
  const inAutoReply = AUTO_REPLY_USERS.includes(authorId);
  const inNotify = NOTIFY_USERS.includes(authorId);

  if (inAutoReply) {
    const inAllowedGuild = message.guild && ALLOWED_GUILD_IDS.includes(message.guild.id);
    const isBotDm = !message.guild;
    const isNotifyForward = isBotDm && message.mentions.users.some(
      (user) => !user.bot && user.id !== authorId && NOTIFY_USERS.includes(user.id)
    );

    if (inAllowedGuild && !isNotifyForward && autoReplyReady && autoReplyEnabled) {
      const cooldownKey = `${authorId}:${message.channel.id}`;

      if (replyInProgress.has(cooldownKey)) return;
      if (Date.now() - (replyCooldown.get(cooldownKey) || 0) < REPLY_COOLDOWN_MS) return;

      replyInProgress.add(cooldownKey);
      replyCooldown.set(cooldownKey, Date.now());

      try {
        conversationLog.logUserMessage(message);
        const replyText = await sendHumanReply(client, message);
        conversationLog.logBotReply({
          botName: client.user.globalName || client.user.username,
          channelName: message.channel.name,
          content: replyText,
        });
        console.log(`💬 Auto-replied to ${message.author.tag}`);
      } catch (error) {
        console.error(`Auto-reply failed for ${message.author.tag}:`, error.message);
      } finally {
        replyInProgress.delete(cooldownKey);
      }
    }
  }

  if (!inNotify) return;

  // DM to bot: @mention another allowed user, then your message
  if (!message.guild) {
    const recipient = message.mentions.users.find(
      (user) => !user.bot && user.id !== message.author.id && NOTIFY_USERS.includes(user.id)
    );
    if (!recipient) return;

    const preview = stripMentions(message.content) || messagePreview(message);
    await sendUserNotification(client, {
      senderUser: message.author,
      recipientIds: [recipient.id],
      preview,
    });
    return;
  }

  // Server message: notify only @mentioned or replied-to allowed users
  if (!ALLOWED_GUILD_IDS.includes(message.guild.id)) return;

  const recipients = await getGuildMessageRecipients(message, NOTIFY_USERS);
  if (!recipients.length) return;

  console.log(`📨 ${message.author.tag} → notifying ${recipients.join(', ')}`);

  await sendUserNotification(client, {
    senderUser: message.author,
    recipientIds: recipients,
    preview: messagePreview(message),
    channelName: message.channel.name,
    serverName: message.guild.name,
    sourceChannel: message.channel,
  });
});

client.on('error', (error) => console.error('Client error:', error));
client.on('shardError', (error) => {
  console.error('Shard error:', error.message);
  if (error.code === 'ENOTFOUND' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
    scheduleReconnect('network error');
  }
});
client.on('shardDisconnect', (event, shardId) => {
  console.warn(`Shard ${shardId} disconnected (code ${event.code})`);
  if (event.code !== 1000) {
    scheduleReconnect('shard disconnect');
  }
});

let reconnectTimer = null;
function scheduleReconnect(reason) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    console.error(`Restarting bot after ${reason}...`);
    process.exit(1);
  }, 3000);
}

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

function startBot() {
  client.login(process.env.BOT_TOKEN).catch(async (error) => {
    console.error('Login failed:', error.message);
    await client.destroy().catch(() => {});
    console.log('Retrying in 10 seconds...');
    setTimeout(startBot, 10000);
  });
}

startBot();
