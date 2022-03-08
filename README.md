# parachain-launch

- [Introducation](#introduction)
- [Options](#options)
- [Global Usage](#global-usage)
- [Local Usage](#local-usage)
- [Start relaychain and parachain](#start-relaychain-and-parachain)
- [Additional Docker Commands](#additional-docker-commands)
- [Resetting all data](#resetting-all-data)

# Introduction

parachain-launch is a script that generates a docker compose file allowing you to launch a testnet of multiple blockchain nodes.

# Options

The following options are supported by the generate script.

| Option        | Description                |Required            | Default      |
| ------------- |----------------------------|:------------------:|--------------|
| --config      | Path to config file.       | No                 | ./config.yml |
| --output      | Path to output dir.        | No                 | ./output     |
| --yes         | Overwrite generated files? | No                 | false        |

# Global Usage

1. Install the package globally:

```sh
yarn global add @open-web3/parachain-launch
```

2. Download the [example config](https://github.com/open-web3-stack/parachain-launch/blob/master/config.yml) file and edit as necessary.

3. Run the generate script:

```sh
parachain-launch generate --config=/path/to/config.yml [--yes] [--output=/path/to/output]
```

This will generate the docker files a folder called `output` in your current working directory or in the directory provided to the `--output` option.

# Local Usage

1. Install the package locally:

```sh
yarn add @open-web3/parachain-launch
```

2. Download the [example config](https://github.com/open-web3-stack/parachain-launch/blob/master/config.yml) file and edit as necessary.

3. Run the service from within the local directory:

```sh
node_modules/.bin/parahain-launch generate --config=/path/to/config.yml [--yes] [--output=/path/to/output]
```

This will generate the docker files a folder called `output` in your current working directory or in the directory provided to the `--output` option.

# Start relaychain and parachain

To start the nodes, navigate to the output folder that you generated the scripts in and build the docker container:

```sh
cd ./output # OR custom output directory

docker-compose up -d --build
```

NOTE: If you regenerate the output directory then you will need to rebuild the docker images.

# Additional Docker Commands

List all of the containers:

```sh
docker ps -a
```

Track container logs:

```sh
docker logs -f [container_id/container_name]
```

Stop all of the containers:

```sh
docker-compose stop
```

Remove all of the containers:

```sh
docker-compose rm
```

Remove all of the containers and volumes (This will wipe any existing chain data):

```sh
docker-compose down -v
```
