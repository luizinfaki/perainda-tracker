import "dotenv/config";
import { postLeaderboard } from "../jobs/leaderboard";

postLeaderboard().then(() => process.exit(0));
