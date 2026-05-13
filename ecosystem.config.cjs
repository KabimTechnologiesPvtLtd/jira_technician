module.exports = {
  apps: [
    {
      name: 'cachedtech-middleware',
      script: 'app.js',
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        IMAP_WATCHER: 'off',   // cron app below handles IMAP polling
      },
      error_file: 'logs/middleware-error.log',
      out_file: 'logs/middleware-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'cachedtech-imap-poll',
      script: 'cron/poll-imap.js',
      interpreter: 'node',
      cron_restart: '*/2 * * * *',   // poll every 2 minutes
      autorestart: false,             // it exits 0 after each run — that is expected
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      error_file: 'logs/imap-error.log',
      out_file: 'logs/imap-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}
