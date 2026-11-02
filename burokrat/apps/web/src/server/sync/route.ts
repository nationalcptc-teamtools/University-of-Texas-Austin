import { defineWebSocketHandler } from "nitro";
import { sync } from "./instance.server.ts";

export default defineWebSocketHandler(sync.hooks);
