# LaCasa POS

Restaurant point-of-sale application with inventory, seating, order history, employee scheduling, payroll, and Telegram workflows.

- `POS-frontend`: React/Vite website.
- `POS-backend`: Express API with local MySQL or Supabase PostgreSQL support.
- `telegram-bot`: Separate Node.js worker for employee requests and receipt processing.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the Supabase migration and Vercel deployment steps. Deploy the frontend and backend as separate Vercel projects using their respective directories as the project root.

Copy each `.env.example` to `.env` for local configuration. Real credentials, receipts, and runtime logs must remain outside Git.
