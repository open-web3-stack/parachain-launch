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

# Global Usage

Install the package globally:

```sh
yarn global add @open-web3/parachain-launch
```

Download the [example config](https://github.com/open-web3-stack/parachain-launch/blob/master/config.yml) file and edit as necessary.

Run the generate script:

```sh
parahain-launch generate --config=/path/to/config.yml [--yes] [--output=/path/to/output]
```

# Local Usage

Install the package locally:

```sh
yarn add @open-web3/parachain-launch
```

Download the [example config](https://github.com/open-web3-stack/parachain-launch/blob/master/config.yml) file and edit as necessary.

Run the service from within the local directory:

```sh
node_modules/.bin/parahain-launch generate --config=/path/to/config.yml [--yes] [--output=/path/to/output]
```

# Start relaychain and parachain

```sh
cd ./output # OR custom output directory if provided

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

# Resetting all data

If you want to clear the data and restart the you will need to clear the volumes.

Remove volume:

```sh
docker volume ls
docker volume rm [volume_name]
```

Prune all volumes:

```sh
docker volume prune
```
