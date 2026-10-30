/** PM2 launches the Bun API. Run from the deployed project directory on Linux. */
module.exports = {
  apps: [
    {
      name: "josti-api",
      script: "bun",
      args: "src/index.ts",
      interpreter: "none",
      cwd: process.env.JOSTI_HOME || "/var/www/josti",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "3000",
      },
    },
  ],
};
