const { EmbedBuilder } = require('discord.js');

function digitalTime() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function messagePreview(message) {
  if (message.content.trim()) {
    return message.content.trim().slice(0, 1000);
  }
  if (message.attachments.size > 0) {
    return `[${message.attachments.size} attachment(s)]`;
  }
  if (message.stickers.size > 0) {
    return '[sticker]';
  }
  return '[new message]';
}

function stripMentions(content) {
  return content.replace(/<@!?(\d+)>/g, '').trim();
}

async function getGuildMessageRecipients(message, allowedIds) {
  const targets = new Set();

  for (const [, user] of message.mentions.users) {
    if (!user.bot && user.id !== message.author.id && allowedIds.includes(user.id)) {
      targets.add(user.id);
    }
  }

  if (message.reference?.messageId) {
    try {
      const replied = await message.fetchReference();
      if (!replied.author.bot && replied.author.id !== message.author.id && allowedIds.includes(replied.author.id)) {
        targets.add(replied.author.id);
      }
    } catch {
      // Reply target unavailable (deleted, no access, etc.)
    }
  }

  return [...targets];
}

async function sendUserNotification(client, { senderUser, recipientIds, preview, channelName, serverName, sourceChannel }) {
  const time = digitalTime();

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({
      name: `${time} · Message from ${senderUser.tag}`,
      iconURL: senderUser.displayAvatarURL({ extension: 'png', size: 64 }),
    })
    .setDescription(preview)
    .setTimestamp();

  if (channelName && serverName) {
    embed.addFields(
      { name: 'Channel', value: `#${channelName}`, inline: true },
      { name: 'Server', value: serverName, inline: true },
    );
  } else {
    embed.setFooter({ text: 'Sent via bot' });
  }

  for (const userId of recipientIds) {
    try {
      const user = await client.users.fetch(userId);
      const dm = await user.createDM();
      await dm.send({
        content: `📩 **${senderUser.username}** sent you a message:`,
        embeds: [embed],
      });
      console.log(`✅ DM notification sent to ${user.tag} (${userId})`);
    } catch (error) {
      console.error(`❌ DM failed for ${userId}:`, error.message);
    }

    if (sourceChannel) {
      try {
        await sourceChannel.send({
          content: `<@${userId}> 📩 **${senderUser.username}** sent you a message:\n${preview}`,
          allowedMentions: { users: [userId] },
        });
        console.log(`✅ Channel ping sent for ${userId} in #${sourceChannel.name}`);
      } catch (error) {
        console.error(`❌ Channel ping failed for ${userId}:`, error.message);
      }
    }
  }
}

module.exports = {
  sendUserNotification,
  messagePreview,
  stripMentions,
  getGuildMessageRecipients,
};
