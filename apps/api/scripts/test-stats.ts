import { AdminStatsService } from "../src/services/adminStatsService.js";

async function main() {
  console.log("--- Testing AdminStatsService ---");
  try {
    const stats = await AdminStatsService.getDashboardStats();
    console.log("Stats calculated successfully:", JSON.stringify(stats, null, 2));
  } catch (err) {
    console.error("Error in AdminStatsService:", err);
  }
}

main().catch(console.error);
