module.exports = {
  apps: [
    {
      name: 'bot-nefertiti',
      script: 'src/bot/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_memory_restart: '500M',
      restart_delay: 5000,
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      time: true,
    },
  ],
};
