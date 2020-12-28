# SENSEd

![Docker Image CI](https://github.com/chrispyduck/sensed/workflows/Docker%20Image%20CI/badge.svg)

A nodejs service that reports readings from local hardware via MQTT by 

## Architecture 
* Combines the [homie-device](https://github.com/chrispyduck/homie-device) and [homie-sensors](https://github.com/chrispyduck/homie-sensors) libraries with minimal internal logic.
* Publishes to MQTT using the [Homie 3.0](https://homieiot.github.io/) specification
* Supports publications and subscriptions so sensors can be read/write (in theory) 
* Designed to be run in a Kubernetes cluster, pinned to a single worker node

## Limitations
* Does not validate configuration; if you misconfigure something, the result will probably be ugly
* Does not fork / run in the background

## Configuration
To do...

## Usage
To do...

## Installation
To do...
