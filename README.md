# parachain-launch

cd launch

# install dependencies
yarn

# generate docker-compose.yml and genesis
# NOTE: If the docker image is not the latest, need to download it manually.
# e.g.: docker pull acala/karura-node:latest
yarn run start generate

# start relaychain and parachain
cd output
# NOTE: If regenerate the output directory, need to rebuild the images.
docker-compose up -d --build

# list all of the containers.
docker ps -a

# track container logs
docker logs -f [container_id/container_name]

# stop all of the containers. 
docker-compose stop

# remove all of the containers. 
docker-compose rm

# NOTE: If you want to clear the data and restart, you need to clear the volumes.
# remove volume 
docker volume ls
docker volume rm [volume_name]
# prune all volumes
docker volume prune