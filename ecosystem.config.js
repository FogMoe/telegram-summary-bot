module.exports = {
  apps: [{
    // 应用基本配置
    name: 'telegram-summary-bot',
    script: './bot.js',
    
    // 运行环境
    node_args: '--max-old-space-size=512',
    
    // 实例配置
    instances: 1,
    exec_mode: 'fork',
    
    // 自动重启配置
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    
    // 环境变量
    env: {
      NODE_ENV: 'production'
    },
    env_development: {
      NODE_ENV: 'development',
      WATCH: true
    },
    
    // 日志配置
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // 重启配置
    kill_timeout: 5000,
    restart_delay: 1000,
    max_restarts: 10,
    min_uptime: '10s',
    
    // 时间配置
    time: true
  }],

  // 部署配置（可选）
  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'https://github.com/your-username/telegram-summary-bot.git',
      path: '/var/www/telegram-summary-bot',
      'post-deploy': 'npm install --production && pm2 reload ecosystem.config.js --env production',
      env: {
        NODE_ENV: 'production'
      }
    }
  }
}; 