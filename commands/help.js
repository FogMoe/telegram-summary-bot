/**
 * Help 命令处理器
 */

const { getAvailableCommands } = require('./index');

const helpCommand = (ctx) => {
  // 获取所有可用命令
  const commands = getAvailableCommands();
  
  // 构建命令列表
  const commandList = commands
    .map(cmd => `/${cmd.command} - ${cmd.description}`)
    .join('\n');
  
  const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
  
  return ctx.reply(`📖 *群组聊天总结机器人 - 使用帮助*

🤖 *机器人介绍*
我是一个智能的群组聊天分析助手，可以帮您快速了解群组的聊天要点和话题讨论。

✨ *主要功能*
• 📊 分析群组聊天记录并生成摘要
• 🌍 自动识别语言并用相应语言回复
• 📈 统计用户活跃度和参与情况
• 💡 提取重要话题和讨论重点

${isGroup ? 
  `🛠️ *在群组中使用*
1. 📝 发送 \`/summary\` - 总结最近100条消息
2. 📝 发送 \`/summary 数量\` - 自定义总结消息数量
   例如：\`/summary 50\` 或 \`/summary 300\`

💡 *使用小贴士*
• 可分析 1 到 1000 条消息
• 每人每群组 5 分钟内只能使用一次
• 机器人会记住群组加入后的所有消息
• 相同条件下会使用缓存，响应更快` 
  : 
  `🛠️ *使用方法*
要使用总结功能，需要：
1. 将我加入到您的群组
2. 在群组中使用 \`/summary\` 命令

⚠️ 总结功能只在群组中可用，私聊主要用于查看帮助信息。`
}

📝 *所有命令*
${commandList}

🌍 *多语言支持*
支持中文、英文、日文、韩文、西班牙文、法文、德文、俄文等多种语言的自动检测和回复。

❓ *遇到问题？*
• 问题反馈：https://github.com/FogMoe/telegram-summary-bot/issues
• 开发者：@ScarletKc

💡 机器人完全免费使用，希望能为您的群组讨论带来便利！`, {
    parse_mode: 'Markdown'
  });
};

module.exports = {
  command: 'help',
  description: '获取详细帮助信息',
  handler: helpCommand
}; 