import "dotenv/config";
import { dispatchRealtimeNotifications } from "../jobs/dispatchNotifications";

dispatchRealtimeNotifications().then(() => process.exit(0));
