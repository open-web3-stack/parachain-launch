import * as readline from 'readline-sync';
import * as shell from 'shelljs';
import { Keyring } from '@polkadot/api';
import { cryptoWaitReady, decodeAddress, encodeAddress } from '@polkadot/util-crypto';
import { hideBin } from 'yargs/helpers';
import { waitReady } from '@polkadot/wasm-crypto';
import YAML from 'yaml';
import _ from 'lodash';
import fs from 'fs';
import path from 'path';
import yargs from 'yargs';

import { Chain, Config, DockerConfig, DockerNode, Parachain } from './types';

/**
 * Check can override file
 *
 * @param path
 * @param yes
 */
const checkOverrideFile = (path: string, yes: boolean) => {
  if (fs.existsSync(path) && !yes) {
    const res = readline.keyInYN(`'${path}' alraedy exists. Do you wish to override it?`);
    if (!res) {
      console.log('Bailing... Bye.');
      process.exit(0);
    }
  }
};

/**
 * Execute shell command
 *
 * @param cmd
 * @param fatal
 */
const exec = (cmd: string, fatal = true) => {
  console.log(`$ ${cmd}`);
  const res = shell.exec(cmd, { silent: true });
  if (res.code !== 0) {
    console.error('Error: Command failed with code', res.code);
    console.log(res);
    if (fatal) {
      process.exit(1);
    }
  }
  return res;
};

/**
 * Exit process on fatal
 *
 * @param args
 */
const fatal = (...args: any[]) => {
  console.trace('Error:', ...args);
  process.exit(1);
};

/**
 * Optionally strip the chain name if it ends with .json
 * e.g. /home/foo/bar/dev.json => dev
 *
 * @param chain
 */
const stripChainspecJsonName = (chain: string) => {
  if (!chain.endsWith('.json')) {
    return chain;
  }

  return path.parse(chain.substring(chain.lastIndexOf('/') + 1)).name;
};

/**
 * Get chain spec
 *
 * @param image
 * @param chain
 */
const getChainspec = (image: string, chain: string) => {
  let res;
  if (chain.endsWith('.json')) {
    res = exec(
      `docker run -v $(pwd)/${chain}:/${chain} --rm ${image} build-spec --chain=/${chain} --disable-default-bootnode`
    );
  } else {
    res = exec(`docker run --rm ${image} build-spec --chain=${chain} --disable-default-bootnode`);
  }

  let spec;

  try {
    spec = JSON.parse(res.stdout);
  } catch (e) {
    return fatal('build spec failed', e);
  }

  return spec;
};

/**
 * Export parachain genesis
 *
 * @param config
 * @param output
 */
const exportParachainGenesis = (parachain: Parachain, output: string) => {
  if (!parachain.image) {
    return fatal('Missing parachains[].image');
  }

  const args = [];

  if (parachain.chain) {
    args.push(`--chain=/app/${getChainspecName(parachain.chain, parachain.id)}`);
  }

  const absOutput = output.startsWith('/') ? output : `$(pwd)/"${output}"`;
  const res2 = exec(`docker run -v "${absOutput}":/app --rm ${parachain.image} export-genesis-wasm ${args.join(' ')}`);
  const wasm = res2.stdout.trim();

  const res = exec(`docker run -v "${absOutput}":/app --rm ${parachain.image} export-genesis-state ${args.join(' ')}`);
  const state = res.stdout.trim();

  return { state, wasm };
};

const jsonStringify = (spec: any) =>
  // JSON.stringify will serialize big number to scientific notation such as 1e+21, which is not supported by Substrate
  JSON.stringify(spec, (_, v) => (typeof v === 'number' ? `@${BigInt(v).toString()}@` : v), 2).replace(
    /"@(.*?)@"/g,
    '$1'
  );

/**
 * Generate relay chain genesis file
 *
 * @param config
 * @param path
 * @param output
 */
const generateRelaychainGenesisFile = (config: Config, path: string, output: string) => {
  const relaychain = config.relaychain;

  if (!relaychain) {
    return fatal('Missing relaychain');
  }
  if (!relaychain.chain) {
    return fatal('Missing relaychain.chain');
  }
  if (!relaychain.image) {
    return fatal('Missing relaychain.image');
  }

  const spec = getChainspec(relaychain.image, relaychain.chain);

  // clear authorities
  const runtime = spec.genesis.runtime;

  const sessionKeys = runtime.runtime_genesis_config?.session?.keys || runtime.session.keys;
  sessionKeys.length = 0;

  // add authorities from config
  const keyring = new Keyring();
  for (const { name } of config.relaychain.nodes) {
    const srAcc = keyring.createFromUri(`//${_.startCase(name)}`, undefined, 'sr25519');
    const srStash = keyring.createFromUri(`//${_.startCase(name)}//stash`, undefined, 'sr25519');
    const edAcc = keyring.createFromUri(`//${_.startCase(name)}`, undefined, 'ed25519');
    const ecAcc = keyring.createFromUri(`//${_.startCase(name)}`, undefined, 'ecdsa');

    const key = [
      srStash.address,
      srStash.address,
      {
        grandpa: edAcc.address,
        babe: srAcc.address,
        im_online: srAcc.address,
        parachain_validator: srAcc.address,
        authority_discovery: srAcc.address,
        para_validator: srAcc.address,
        para_assignment: srAcc.address,
        beefy: encodeAddress(ecAcc.publicKey),
      },
    ];

    sessionKeys.push(key);
  }

  // additional patches
  if (config.relaychain.runtimeGenesisConfig) {
    const hrmp = config.relaychain.runtimeGenesisConfig.hrmp;
    if (hrmp) {
      hrmp.preopenHrmpChannels = hrmp.preopenHrmpChannels.map((channel) => {
        if (!Array.isArray(channel)) {
          return [channel.sender, channel.recipient, channel.maxCapacity, channel.maxMessageSize];
        } else {
          return channel;
        }
      });
    }
    _.merge(runtime.runtime_genesis_config, config.relaychain.runtimeGenesisConfig);
    _.merge(runtime, config.relaychain.overrides);
  }

  // genesis parachains
  for (const parachain of config.parachains) {
    const { wasm, state } = exportParachainGenesis(parachain, output);
    if (!parachain.id) {
      return fatal('Missing parachains[].id');
    }
    const para = [
      parachain.id,
      {
        genesis_head: state,
        validation_code: wasm,
        parachain: parachain.parachain,
      },
    ];
    (runtime.runtime_genesis_config || runtime).paras.paras.push(para);
  }

  const tmpfile = `${shell.tempdir()}/${config.relaychain.chain}.json`;
  fs.writeFileSync(tmpfile, jsonStringify(spec));

  exec(
    `docker run --rm -v "${tmpfile}":/${config.relaychain.chain}.json ${config.relaychain.image} build-spec --raw --chain=/${config.relaychain.chain}.json --disable-default-bootnode > ${path}`
  );

  shell.rm(tmpfile);

  console.log('Relaychain genesis generated at', path);
};

/**
 * Get account address
 *
 * @param val
 */
const getAddress = (val: string) => {
  try {
    const addr = decodeAddress(val);
    return encodeAddress(addr);
  } catch {
    // ignore
  }

  const keyring = new Keyring();
  const pair = keyring.createFromUri(`//${_.startCase(val)}`, undefined, 'sr25519');

  return pair.address;
};

/**
 * Generate node key
 *
 * @param image
 */
const generateNodeKey = (image: string) => {
  const res = exec(`docker run --rm ${image} key generate-node-key`);
  return {
    key: res.stdout.trim(),
    address: res.stderr.trim(),
  };
};

/**
 * Set parachain runtime value - Support
 * for older genesis format where runtime
 * keys are prefixed.
 *
 * @param runtime
 * @param key
 * @param value
 */
const setParachainRuntimeValue = (runtime: { [index: string]: any }, key: string, value: { [index: string]: any }) => {
  const keys = Object.keys(runtime);
  const regex = new RegExp(`^(module|frame|pallet|orml)?(?=${key})(${key})$`, 'i');

  const matches = keys.filter((key) => key.match(regex));

  if (matches.length) {
    runtime[matches[0]] = { ...(runtime[matches[0]] || {}), ...value };
    return;
  }

  runtime[key] = value;
};

/**
 * Construct the parachain spec name
 *
 * @param chain
 * @param id
 */
const getChainspecName = (chain: Chain | string, id: number) => {
  const chainName = typeof chain === 'string' ? chain : chain.base;
  return `${stripChainspecJsonName(chainName)}-${id}.json`;
};

/**
 * Generate parachain genesis file
 *
 * @param id
 * @param image
 * @param chain
 * @param output
 * @param yes
 */
const generateParachainGenesisFile = (
  id: number,
  image: string,
  chain: Chain | string,
  output: string,
  yes: boolean
) => {
  if (typeof chain === 'string') {
    chain = { base: chain };
  }

  if (!image) {
    return fatal('Missing paras[].image');
  }
  if (!chain) {
    return fatal('Missing paras[].chain');
  }
  if (!chain.base) {
    return fatal('Missing paras[].chain.base');
  }

  const specname = getChainspecName(chain, id);
  const filepath = path.join(output, specname);

  checkOverrideFile(filepath, yes);

  const spec = getChainspec(image, chain.base);

  spec.bootNodes = [];

  // Replace `paraId` and `parachainId` with the specified parachain-id.
  if (spec.para_id) {
    spec.para_id = id;
  } else {
    spec.paraId = id;
  }
  const runtime = spec.genesis.runtime;
  if (runtime) {
    runtime.parachainInfo.parachainId = id;
  }

  const endowed = [];

  if (chain.sudo && runtime.sudo) {
    runtime.sudo.key = getAddress(chain.sudo);
    endowed.push(runtime.sudo.key);
  }

  if (chain.collators) {
    const invulnerables = chain.collators.map(getAddress);
    if (!chain.skipCollatorSelection) {
      setParachainRuntimeValue(runtime, 'collatorSelection', { invulnerables: invulnerables });
    }
    setParachainRuntimeValue(runtime, 'session', {
      keys: chain.collators.map((x) => {
        const addr = getAddress(x);
        return [addr, addr, { aura: addr }];
      }),
    });
    endowed.push(...invulnerables);
  }

  if (endowed.length) {
    const decimals = _.get(spec, 'properties.tokenDecimals[0]') || _.get(spec, 'properties.tokenDecimals') || 15;
    const balances: [string, number][] =
      _.get(runtime, 'balances.balances') || _.get(runtime, 'palletBalances.balances') || [];
    const balObj: { [index: string]: number } = {};
    for (const [addr, val] of balances) {
      balObj[addr] = val;
    }
    if (chain.runtimeGenesisConfig?.balances) {
      for (const [addr, val] of chain.runtimeGenesisConfig.balances.balances) {
        balObj[addr] = (balObj[addr] || 0) + val;
      }
      delete chain.runtimeGenesisConfig.balances;
    }
    for (const addr of endowed) {
      balObj[addr] = (balObj[addr] || 0) + Math.pow(10, decimals) * 1000;
    }
    if (!chain.skipBalances) {
      setParachainRuntimeValue(runtime, 'balances', { balances: Object.entries(balObj) });
    }
  }

  if (chain.runtimeGenesisConfig) {
    _.merge(runtime, chain.runtimeGenesisConfig);
  }

  fs.writeFileSync(filepath, jsonStringify(spec));
};

/**
 * Generate docker files
 *
 * @param config
 * @param output
 * @param yes
 */
const generateDockerfiles = (config: Config, output: string, yes: boolean) => {
  const relaychainDockerfilePath = path.join(output, 'relaychain.Dockerfile');
  checkOverrideFile(relaychainDockerfilePath, yes);

  const relaychainDockerfile = [`FROM ${config.relaychain.image}`, 'COPY . /app'];

  fs.writeFileSync(relaychainDockerfilePath, relaychainDockerfile.join('\n'));

  for (const parachain of config.parachains) {
    const parachainDockerfilePath = path.join(output, `parachain-${parachain.id}.Dockerfile`);
    checkOverrideFile(parachainDockerfilePath, yes);

    const parachainDockerfile = [`FROM ${parachain.image}`, 'COPY . /app'];

    fs.writeFileSync(parachainDockerfilePath, parachainDockerfile.join('\n'));
  }
};

/**
 * Generate docker compose files
 *
 * @param config
 * @param args
 */
const generate = async (config: Config, { output, yes }: { output: string; yes: boolean }) => {
  await cryptoWaitReady();
  await waitReady();

  if (!config?.relaychain?.chain) {
    return fatal('Missing relaychain.chain');
  }
  if (!config?.relaychain?.image) {
    return fatal('Missing relaychain.image');
  }

  const relaychainGenesisFilePath = path.join(output, `${config.relaychain.chain}.json`);
  checkOverrideFile(relaychainGenesisFilePath, yes);

  const dockerComposePath = path.join(output, 'docker-compose.yml');
  checkOverrideFile(dockerComposePath, yes);

  fs.mkdirSync(output, { recursive: true });

  for (const parachain of config.parachains) {
    generateParachainGenesisFile(parachain.id, parachain.image, parachain.chain, output, yes);
  }

  generateRelaychainGenesisFile(config, relaychainGenesisFilePath, output);
  generateDockerfiles(config, output, yes);

  const dockerCompose: DockerConfig = {
    version: '3.7',
    services: {},
    volumes: {},
  };

  const ulimits = {
    nofile: {
      soft: 65536,
      hard: 65536,
    },
  };

  let idx = 0;
  for (const node of config.relaychain.nodes) {
    const name = `relaychain-${_.kebabCase(node.name)}`;
    const nodeConfig: DockerNode = {
      ports: [
        ...(node.wsPort === false ? [] : [`${node.wsPort || 9944 + idx}:9944`]),
        ...(node.rpcPort === false ? [] : [`${node.rpcPort || 9933 + idx}:9933`]),
        ...(node.port === false ? [] : [`${node.port || 30333 + idx}:30333`]),
      ],
      volumes: [`${name}:/data`],
      build: {
        context: '.',
        dockerfile: 'relaychain.Dockerfile',
      },
      command: [
        '--base-path=/data',
        `--chain=/app/${config.relaychain.chain}.json`,
        '--validator',
        '--ws-external',
        '--rpc-external',
        '--rpc-cors=all',
        `--name=${node.name}`,
        `--${node.name.toLowerCase()}`,
        ...(config.relaychain.flags || []),
        ...(node.flags || []),
      ],
      environment: _.assign({}, config.relaychain.env, node.env),
      ulimits,
    };

    dockerCompose.services[name] = nodeConfig;
    dockerCompose.volumes[name] = null;

    ++idx;
  }

  for (const parachain of config.parachains) {
    let nodeIdx = 0;

    const { key: nodeKey, address: nodeAddress } = generateNodeKey(config.relaychain.image);
    const volumePath = parachain.volumePath || '/data';

    for (const parachainNode of parachain.nodes) {
      const name = `parachain-${parachain.id}-${nodeIdx}`;

      const nodeConfig: DockerNode = {
        ports: [
          `${parachainNode.wsPort || 9944 + idx}:9944`,
          `${parachainNode.rpcPort || 9933 + idx}:9933`,
          `${parachainNode.port || 30333 + idx}:30333`,
        ],
        volumes: [`${name}:${volumePath}`],
        build: {
          context: '.',
          dockerfile: `parachain-${parachain.id}.Dockerfile`,
        },
        command: [
          `--base-path=${volumePath}`,
          `--chain=/app/${getChainspecName(parachain.chain, parachain.id)}`,
          '--ws-external',
          '--rpc-external',
          '--rpc-cors=all',
          `--name=${name}`,
          '--collator',
          ...(parachain.flags || []),
          ...(parachainNode.flags || []),
          nodeIdx === 0
            ? `--node-key=${nodeKey}`
            : `--bootnodes=/dns/parachain-${parachain.id}-0/tcp/30333/p2p/${nodeAddress}`,
          '--listen-addr=/ip4/0.0.0.0/tcp/30333',
          '--',
          `--chain=/app/${config.relaychain.chain}.json`,
          ...(parachain.relaychainFlags || []),
          ...(parachainNode.relaychainFlags || []),
        ],
        environment: _.assign({}, parachain.env, parachainNode.env),
        ulimits,
      };

      dockerCompose.services[name] = nodeConfig;
      dockerCompose.volumes[name] = null;

      ++nodeIdx;
      ++idx;
    }
  }

  fs.writeFileSync(dockerComposePath, YAML.stringify(dockerCompose));

  console.log('docker-compose.yml generated at', dockerComposePath);
};

void yargs(hideBin(process.argv))
  .strict()
  .options({
    output: {
      alias: 'o',
      type: 'string',
      default: 'output',
      description: 'The output directory path',
    },
    yes: {
      alias: 'y',
      type: 'boolean',
      default: false,
      description: 'Yes for options',
    },
  })
  .command(
    'generate [config]',
    'generate the network genesis and docker-compose.yml',
    (yargs) =>
      yargs.positional('config', {
        describe: 'Path to config.yml file',
        default: 'config.yml',
      }),
    (argv) => {
      const { config: configPath } = argv;

      let config: Config | undefined;

      try {
        const configFile = fs.readFileSync(configPath, 'utf8');
        config = YAML.parse(configFile);
      } catch (e) {
        console.error('Invalid config file:', configPath, e);
      }

      if (config) {
        // no parachains config(relaychain only)
        if (!config.parachains) {
          config.parachains = [];
        }
        generate(config, argv).catch(fatal);
      }
    }
  )
  .help('h')
  .alias('h', 'help').argv;
