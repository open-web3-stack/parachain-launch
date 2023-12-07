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
    configuration?: { config: { [index: string]: string | number } };
    hrmp?: {
      preopenHrmpChannels: HrmpChannelsConfig[];
    };
  };
  overrides: { [index: string]: string | number | boolean | object };
}

export interface Parachain {
  id: number;
  image: string;
  chain: Chain | string;
  parachain: boolean;
  flags?: string[];
  relaychainFlags?: string[];
  env?: Env;
  volumePath?: string;
  nodes: Node[];
}

export interface Chain {
  base: string;
  collators?: string[];
  sudo?: string;
  runtimeGenesisConfig?: {
    balances?: { balances: [string, number][] };
    tokens?: { balances: [string, any, number][] };
    parachainInfo?: { parachainId: number };
    [key: string]: any;
  };
  skipCollatorSelection?: boolean;
  skipBalances?: boolean;
}

export interface Node {
  env: Env;
  name: string;
  flags?: string[];
  port?: number | false;
  rpcPort?: number | false;
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

export type HrmpChannelsConfig =
  | {
      sender: number;
      recipient: number;
      maxCapacity: number;
      maxMessageSize: number;
    }
  | [number, number, number, number];
