// Keep local MySQL deployments working during the Supabase migration.
module.exports = (mysql, postgres) => process.env.DATABASE_URL ? postgres : mysql;
