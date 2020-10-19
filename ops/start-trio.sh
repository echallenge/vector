#!/usr/bin/env bash
set -e

stack="trio"

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project=$(grep -m 1 '"name":' "$root/package.json" | cut -d '"' -f 4)

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay "$project" 2> /dev/null || true

if grep -qs "$stack" <<<"$(docker stack ls --format '{{.Name}}')"
then echo "A $stack stack is already running" && exit 0;
else echo; echo "Preparing to launch $stack stack"
fi

####################
# Load Config

node_config="$(cat "$root/config-node.json")"
router_config="$(cat "$root/config-router.json")"
config="$(echo "$node_config" "$router_config" | jq -s '.[0] + .[1]')"

####################
# Misc Config

version="latest"

common="networks:
      - '$project'
    logging:
      driver: 'json-file'
      options:
          max-size: '100m'"

########################################
# Global services / chain provider config

bash "$root/ops/start-global.sh"

chain_addresses="$(cat "$root/.chaindata/chain-addresses.json")"
config="$(echo "$config" '{"chainAddresses":'"$chain_addresses"'}' | jq -s '.[0] + .[1]')"

########################################
## Database config

database_image="${project}_database:$version"
bash "$root/ops/pull-images.sh" "$database_image" > /dev/null

pg_port="5432"

database_env="environment:
      POSTGRES_DB: '$project'
      POSTGRES_PASSWORD: '$project'
      POSTGRES_USER: '$project'"

########################################
## Node config

internal_node_port="8000"

carol_node_port="8005"
carol_database="database_c"
carol_mnemonic="owner warrior discover outer physical intact secret goose all photo napkin fall"
echo "$stack.carol will be exposed on *:$carol_node_port"

dave_node_port="8006"
dave_database="database_d"
dave_mnemonic="woman benefit lawn ignore glove marriage crumble roast tool area cool payment"
echo "$stack.dave will be exposed on *:$dave_node_port"

roger_node_port="8007"
roger_database="database_r"
roger_mnemonic="spice notable wealth rail voyage depth barely thumb skill rug panel blush"
echo "$stack.roger will be exposed on *:$roger_node_port"

config="$(echo "$config" '{"nodeUrl":"http://roger:'$internal_node_port'"}' | jq -s '.[0] + .[1]')"

public_url="http://localhost:$roger_node_port"

node_image="image: '${project}_builder'
    entrypoint: 'bash modules/server-node/ops/entry.sh'
    volumes:
      - '$root:/root'"

node_env="environment:
      VECTOR_CONFIG: '$config'
      VECTOR_PG_DATABASE: '$project'
      VECTOR_PG_PASSWORD: '$project'
      VECTOR_PG_PORT: '$pg_port'
      VECTOR_PG_USERNAME: '$project'"

########################################
## Router config

router_port="8000"
router_exposed_port="8009"
echo "$stack.router will be exposed on *:$router_exposed_port"

router_image="image: '${project}_builder'
    entrypoint: 'bash modules/router/ops/entry.sh'
    volumes:
      - '$root:/root'
    ports:
      - '$router_exposed_port:$router_port'"

####################
# Observability tools config

grafana_image="grafana/grafana:latest"
bash "$root/ops/pull-images.sh" "$grafana_image" > /dev/null

prometheus_image="prom/prometheus:latest"
bash "$root/ops/pull-images.sh" "$prometheus_image" > /dev/null

cadvisor_image="gcr.io/google-containers/cadvisor:latest"
bash "$root/ops/pull-images.sh" "$cadvisor_image" > /dev/null

prometheus_services="prometheus:
    image: $prometheus_image
    $common
    ports:
      - 9090:9090
    command:
      - --config.file=/etc/prometheus/prometheus.yml
    volumes:
      - $root/ops/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
  cadvisor:
    $common
    image: $cadvisor_image
    ports:
      - 8081:8080
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:rw
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro"

grafana_service="grafana:
    image: '$grafana_image'
    $common
    networks:
      - '$project'
    ports:
      - '3008:3000'
    volumes:
      - '$root/ops/grafana/grafana:/etc/grafana'
      - '$root/ops/grafana/dashboards:/etc/dashboards'"

observability_services="$prometheus_services
  $grafana_service"

####################
# Launch stack

docker_compose=$root/.${stack}.docker-compose.yml
rm -f "$docker_compose"
cat - > "$docker_compose" <<EOF
version: '3.4'

networks:
  $project:
    external: true

services:

  carol:
    $common
    $node_image
    $node_env
      VECTOR_PG_HOST: '$carol_database'
      VECTOR_MNEMONIC: '$carol_mnemonic'
    ports:
      - '$carol_node_port:$internal_node_port'

  dave:
    $common
    $node_image
    $node_env
      VECTOR_PG_HOST: '$dave_database'
      VECTOR_MNEMONIC: '$dave_mnemonic'
    ports:
      - '$dave_node_port:$internal_node_port'

  roger:
    $common
    $node_image
    $node_env
      VECTOR_PG_HOST: '$roger_database'
      VECTOR_MNEMONIC: '$roger_mnemonic'
    ports:
      - '$roger_node_port:$internal_node_port'

  router:
    $common
    $router_image
    environment:
      VECTOR_CONFIG: '$config'
      VECTOR_NODE_URL: 'http://roger:$internal_node_port'
      VECTOR_PG_DATABASE: '$project'
      VECTOR_PG_HOST: '$roger_database'
      VECTOR_PG_PASSWORD: '$project'
      VECTOR_PG_PORT: '$pg_port'
      VECTOR_PG_USERNAME: '$project'
      VECTOR_PORT: '$router_port'

  $carol_database:
    $common
    image: '$database_image'
    $database_env

  $dave_database:
    $common
    image: '$database_image'
    $database_env

  $roger_database:
    $common
    image: '$database_image'
    $database_env

  $observability_services

EOF

docker stack deploy -c "$docker_compose" "$stack"

echo "The $stack stack has been deployed, waiting for $public_url to start responding.."
timeout=$(( $(date +%s) + 60 ))
while true
do
  res="$(curl -k -m 5 -s $public_url || true)"
  if [[ -z "$res" || "$res" == "Waiting for proxy to wake up" ]]
  then
    if [[ "$(date +%s)" -gt "$timeout" ]]
    then echo "Timed out waiting for proxy to respond.." && exit
    else sleep 2
    fi
  else echo "Good Morning!" && exit;
  fi
done
