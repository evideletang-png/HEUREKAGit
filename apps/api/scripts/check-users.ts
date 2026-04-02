import { db, usersTable } from "@workspace/db";

async function checkUsers() {
  const users = await db.select().from(usersTable);
  console.log("Users in DB:");
  users.forEach(u => {
    console.log(`- ID: ${u.id}, Email: ${u.email}, Hash: ${u.passwordHash}`);
  });
  console.log(`\nTotal users: ${users.length}`);
}

checkUsers().catch(console.error);
