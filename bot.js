/**
 * 程序入口
 * 加载环境变量并启动应用（应用逻辑见 src/app.js）
 */

require('dotenv').config();

const { start } = require('./src/app');

start();
