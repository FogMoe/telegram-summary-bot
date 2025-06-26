/**
 * Start 命令处理器
 */

const { getAvailableCommands } = require('./index');

const startCommand = (ctx) => {
  // 获取用户信息
  const userName = ctx.from.first_name || '用户';
  const userId = ctx.from.id;
  const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
  
  // 获取所有可用命令
  const commands = getAvailableCommands();
  
  // 构建命令列表
  const commandList = commands
    .map(cmd => `/${cmd.command} - ${cmd.description}`)
    .join('\n');
  
  // 根据聊天类型调整消息内容
  if (isGroup) {
    // 群组欢迎消息
    return ctx.reply(`🎉 欢迎使用 Telegram 群组聊天总结机器人！

👋 我是一个智能的群组聊天分析机器人，可以帮助您总结群组聊天记录。

🤖 *主要功能*：
• 📊 分析群组聊天记录（支持1-1000条消息）
• 🧠 使用 AI 生成智能总结
• 🌍 自动检测语言并使用相应语言回复
• 📈 提供用户活跃度和话题分析

📝 *可用命令*：
${commandList}

💡 *使用提示*：
• 使用 /summary 命令开始总结聊天记录
• 机器人会自动记录加入后的所有群组消息
• 每用户每群组有5分钟冷却期防止频繁调用

🔔 发起者：${userName} (ID: ${userId})`, {
      parse_mode: 'Markdown'
    });
  } else {
    // 私聊欢迎消息
    return ctx.reply(`🎉 欢迎使用 Telegram 群组聊天总结机器人，${userName}！

👋 我是一个专为群组聊天分析设计的智能机器人。

🤖 *核心功能*：
• 📊 群组聊天记录智能总结
• 🌍 多语言自动检测和回复
• 📈 用户互动和话题分析
• 💾 智能缓存和数据管理

📝 *可用命令*：
${commandList}

💡 *使用方法*：
1. 将我添加到您的群组
2. 在群组中使用 /summary 命令
3. 我会分析并总结聊天记录

⚠️ *注意*：总结功能仅在群组中可用，私聊主要用于查看帮助和状态信息。

🔔 您的用户ID: ${userId}`, {
      parse_mode: 'Markdown'
    });
  }
};

module.exports = {
  command: 'start',
  description: '显示欢迎信息和使用说明',
  handler: startCommand
}; 