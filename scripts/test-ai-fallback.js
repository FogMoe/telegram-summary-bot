#!/usr/bin/env node

/**
 * AI 模型自动切换功能测试脚本
 * 测试主要模型(Gemini)和备用模型(Azure OpenAI)的自动切换
 */

require('dotenv').config();
const logger = require('../utils/logger');
const aiService = require('../services/aiService');

async function testAIFallback() {
  console.log('🔧 开始测试 AI 模型自动切换功能...\n');

  try {
    // 初始化AI服务
    console.log('📝 初始化AI服务...');
    await aiService.init();
    console.log('✅ AI服务初始化成功\n');

    // 获取服务状态
    console.log('📊 检查服务状态...');
    const status = aiService.getStatus();
    console.log('服务状态:', JSON.stringify(status, null, 2));
    console.log('');

    // 测试连接
    console.log('🔗 测试AI模型连接...');
    const connectionResult = await aiService.testConnection();
    
    if (connectionResult.success) {
      console.log('✅ 连接测试成功');
      console.log('连接结果:', JSON.stringify(connectionResult.results, null, 2));
    } else {
      console.log('❌ 连接测试失败');
      console.log('连接结果:', JSON.stringify(connectionResult.results, null, 2));
    }
    console.log('');

    // 测试内容生成（自动切换功能）
    console.log('🤖 测试内容生成和自动切换功能...');
    
    const testMessages = [
      { role: 'system', content: '你是一个AI助手，请简洁回答问题。' },
      { role: 'user', content: '请简单介绍一下自己，控制在50字以内。' }
    ];

    try {
      const response = await aiService.generateContentWithFallback({
        messages: testMessages,
        max_tokens: 100,
        temperature: 0.7,
        top_p: 0.9
      });

      console.log('✅ 内容生成成功');
      console.log('使用的模型:', response.modelUsed === 'primary' ? '主要模型(Gemini)' : '备用模型(Azure OpenAI)');
      console.log('模型名称:', response.modelName);
      console.log('生成的内容:', response.choices[0]?.message?.content);
      
      if (response.primaryError) {
        console.log('⚠️  主要模型错误:', response.primaryError);
      }

    } catch (error) {
      console.log('❌ 内容生成失败');
      console.log('错误信息:', error.message);
      
      if (error.primaryError) {
        console.log('主要模型错误:', error.primaryError.message);
      }
      if (error.fallbackError) {
        console.log('备用模型错误:', error.fallbackError.message);
      }
    }

    console.log('');

    // 测试模拟的消息总结功能
    console.log('📝 测试消息总结功能...');
    
    const mockMessages = [
      {
        user_id: 123,
        first_name: 'Alice',
        username: 'alice123',
        text: '大家好，今天天气真不错！',
        timestamp: Math.floor(Date.now() / 1000) - 3600
      },
      {
        user_id: 456,
        first_name: 'Bob',
        username: 'bob456',
        text: '是的，很适合出去走走。你们有什么计划吗？',
        timestamp: Math.floor(Date.now() / 1000) - 3000
      },
      {
        user_id: 123,
        first_name: 'Alice',
        username: 'alice123',
        text: '我在考虑去公园拍照。',
        timestamp: Math.floor(Date.now() / 1000) - 1800
      }
    ];

    const mockStats = {
      unique_users: 2,
      earliest_message: Math.floor(Date.now() / 1000) - 3600,
      latest_message: Math.floor(Date.now() / 1000) - 1800
    };

    const mockTopUsers = [
      { first_name: 'Alice', username: 'alice123', message_count: 2 },
      { first_name: 'Bob', username: 'bob456', message_count: 1 }
    ];

    try {
      const summaryResult = await aiService.summarizeMessages(mockMessages, mockStats, mockTopUsers);
      
      console.log('✅ 消息总结生成成功');
      console.log('总结内容预览:', summaryResult.summary.substring(0, 200) + '...');
      console.log('使用的令牌数:', summaryResult.metadata.tokensUsed);
      console.log('分析的消息数:', summaryResult.metadata.messagesAnalyzed);

    } catch (error) {
      console.log('❌ 消息总结失败');
      console.log('错误信息:', error.message);
    }

    console.log('\n🎉 AI模型自动切换功能测试完成！');

  } catch (error) {
    console.log('❌ 测试过程中发生错误:', error.message);
    console.log('错误详情:', error.stack);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  testAIFallback()
    .then(() => {
      console.log('\n✅ 测试脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ 测试脚本执行失败:', error.message);
      process.exit(1);
    });
}

module.exports = { testAIFallback }; 