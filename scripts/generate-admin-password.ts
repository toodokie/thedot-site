import bcrypt from 'bcryptjs';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function generatePasswordHash() {
  rl.question('Enter admin password: ', async (password) => {
    if (!password || password.length < 8) {
      console.error('❌ Password must be at least 8 characters long');
      process.exit(1);
    }

    const hash = await bcrypt.hash(password, 10);

    console.log('\n✅ Password hash generated successfully!\n');
    console.log('Add this to your .env.local file:\n');
    console.log(`ADMIN_PASSWORD_HASH=${hash}`);
    console.log('\nAlso add a strong JWT secret:\n');
    console.log(`ADMIN_JWT_SECRET=${generateRandomSecret()}`);
    console.log('\n');

    rl.close();
  });
}

function generateRandomSecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let secret = '';
  for (let i = 0; i < 64; i++) {
    secret += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return secret;
}

generatePasswordHash();
