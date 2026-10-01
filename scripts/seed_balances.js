const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('kobo.db');

const rows = db.prepare("SELECT wallet_address, SUM(amount_ngn) as total FROM deposits WHERE status = 'success' GROUP BY wallet_address").all();
console.log('Found deposit groups:', rows);

for (const r of rows) {
  if (r.wallet_address) {
    db.prepare('INSERT OR REPLACE INTO user_balances (wallet_address, naira_balance, updated_at) VALUES (?, ?, ?)')
      .run(r.wallet_address.toLowerCase(), r.total, Date.now());
  }
}

console.log('Seeded user_balances:', db.prepare('SELECT * FROM user_balances').all());
