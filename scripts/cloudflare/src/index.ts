export { MangabaClawContainer } from "./container.js";

interface ContainerStub {
  fetch(request: Request): Promise<Response>;
}

interface ContainerNamespace {
  getByName(name: string): ContainerStub;
}

interface WorkerEnv {
  MANGABACLAW_CONTAINER: ContainerNamespace;
}

interface WorkerHandler {
  fetch(request: Request, env: WorkerEnv): Promise<Response>;
}

// One stable name gives the installation one globally unique Durable Object.
// That object is the outer single-writer fence for the Litestream replica.
const INSTALLATION_INSTANCE = "mangabaclaw-installation";

const worker: WorkerHandler = {
  async fetch(request, env) {
    return env.MANGABACLAW_CONTAINER.getByName(INSTALLATION_INSTANCE).fetch(request);
  },
};

export default worker;
