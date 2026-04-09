// PM2 Configuration for 24/7 operation
// Install PM2: npm install -g pm2
// Start: pm2 start ecosystem.config.js
// Monitor: pm2 monit
// Logs: pm2 logs ai-receptionist

module.exports = {
  apps: [
    {
      name: 'ai-receptionist',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      // Restart if process uses too much memory
      max_restarts: 50,
      restart_delay: 5000,
      // Log configuration
      error_file: './logs/error.log',
      out_file: './logs/output.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      // Graceful shutdown
      kill_timeout: 5000,
    },
  ],
};
