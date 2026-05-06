import { NodeRuntime } from "@effect/platform-node";
import { Layer } from "effect";

import { ServerLive } from "./server-node.js";

NodeRuntime.runMain(Layer.launch(ServerLive));
