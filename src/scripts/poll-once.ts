import "dotenv/config";
import { pollAllPlayers } from "../jobs/pollPlayers";

pollAllPlayers().then(() => process.exit(0));
