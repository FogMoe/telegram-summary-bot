function getCommandInfo(ctx) {
  const text = ctx?.message?.text;
  if (!text) {
    return null;
  }

  const entities = ctx.message?.entities || [];
  const commandEntity = entities.find(
    (entity) => entity.type === 'bot_command' && entity.offset === 0
  );

  if (!commandEntity) {
    return null;
  }

  const rawCommand = text.slice(commandEntity.offset, commandEntity.offset + commandEntity.length);
  const commandWithMention = rawCommand.startsWith('/') ? rawCommand.slice(1) : rawCommand;
  const [command, mention] = commandWithMention.split('@');

  return {
    raw: rawCommand,
    command,
    mention
  };
}

function isCommandForBot(ctx) {
  const info = getCommandInfo(ctx);
  if (!info) {
    return false;
  }

  if (!info.mention) {
    return true;
  }

  const botUsername = ctx?.botInfo?.username;
  if (!botUsername) {
    return false;
  }

  return info.mention.toLowerCase() === botUsername.toLowerCase();
}

function isCommandMatch(ctx, commandName) {
  if (!commandName) {
    return false;
  }

  const info = getCommandInfo(ctx);
  if (!info) {
    return false;
  }

  if (!isCommandForBot(ctx)) {
    return false;
  }

  return info.command?.toLowerCase() === commandName.toLowerCase();
}

module.exports = {
  getCommandInfo,
  isCommandForBot,
  isCommandMatch
};
