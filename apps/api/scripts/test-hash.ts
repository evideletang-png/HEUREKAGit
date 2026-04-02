import bcrypt from "bcryptjs";

const hash = "$2b$12$TYDDHZSUZ1SsrrxOCvKZ2.Rh..RzSpHZMh2SYIpz.GGnowZJRVE8G";
const password = "password";

async function test() {
  const match = await bcrypt.compare(password, hash);
  console.log(`Password "${password}" matches hash: ${match}`);
  
  const commonHash = "$2b$10$k7TO5RoONZwcwIZNKo4Lee8yUXdhT7cc8xUZSfxBXWvowXMUq/xWu";
  const matchCommon = await bcrypt.compare(password, commonHash);
  console.log(`Password "${password}" matches commonHash: ${matchCommon}`);
}

test().catch(console.error);
