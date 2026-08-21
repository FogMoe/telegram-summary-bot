const registeredCommands = new Set();

function registerCommand(commandName) {
  if (!commandName) {
    return;
  }
  registeredCommands.add(commandName.toLowerCase());
}

function isCommandRegistered(commandName) {
  if (!commandName) {
    return false;
  }
  return registeredCommands.has(commandName.toLowerCase());
}

module.exports = {
  registerCommand,
  isCommandRegistered
};
