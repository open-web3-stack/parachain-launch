export interface Config {
  relaychain: RelayChain;
  parachains: Parachain[];
}

export interface RelayChain {
  env: Env;
  image: string;
  chain: string;
  flags: string[];
  nodes: Node[];
  runtimeGenesisConfig: {
    parachainsConfiguration: { config: { [index: string]: string | number } };
  };
}

export interface Parachain {
  id: number;
  image: string;
  chain: Chain | string;
  parachain: boolean;
  flags: string[];
  relaychainFlags: string[];
  env: Env;
  nodes: Node[];
}

export interface Chain {
  base: string;
  collators?: string[];
  sudo?: string;
}

export interface Node {
  env: Env;
  name: string;
  flags?: string[];
  port?: number;
  wsPort?: number;
  rpcPort?: number;
  relaychainFlags?: string[];
}

export interface Env {
  [index: string]: string;
}

export interface DockerConfig {
  version: string;
  services: { [index: string]: DockerNode };
  volumes: { [index: string]: any };
}

export interface DockerNode {
  ports: string[];
  volumes: string[];
  build: {
    context: string;
    dockerfile: string;
  };
  command: string[];
  environment: Env;
  ulimits: {
    nofile?: {
      soft: number;
      hard: number;
    };
  };
}
