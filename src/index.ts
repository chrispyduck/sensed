import { HomieDevice } from "@chrispyduck/homie-device";
import { AHT20, ISensor } from "@chrispyduck/homie-sensors";
import IConfiguration, { II2CSensor, Sensor } from "./IConfiguration";
import fs from "fs";
import * as math from "mathjs";
import rootLogger from "./Logging";
import process from "process";
import Metrics from "./Metrics";

class Main {
  loadConfig = async (): Promise<IConfiguration> => {
    const raw = await fs.promises.readFile("config.json", { encoding: "utf8" });
    return JSON.parse(raw) as IConfiguration;
  }

  resolveSensor = (config: Sensor): ISensor<Record<never, any>> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    switch (config.type) {
      case "i2c": {
        return this.resolveI2cSensor(config);
      }
    }
    throw new Error(`Unsupported sensor type: ${config.type}`);
  }

  resolveI2cSensor = (config: II2CSensor): ISensor<Record<never, any>> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    switch (config.model.toUpperCase()) {
      //todo: move this logic into homie-sensors
      case "AHT20": {
        return new AHT20(config.configuration);
      }
    }
    throw new Error(`Unsupported I2C sensor model: ${config.model}`);
  }

  run = async () => {
    const config = await this.loadConfig();
    const device = this.device = new HomieDevice(config.device);

    const initJobs = config.sensors
      .map(config => ({
        sensor: this.resolveSensor(config),
        config
      }))
      .map(sensor => {
        sensor.sensor.register(device);
        this.sensors.push(sensor);
        return sensor.sensor.init();
      });
    await Promise.all(initJobs);

    device.setup();
    this.metrics.init(config);

    this.interval = this.sensors.length == 1
      ? this.sensors[0].config.measureInterval
      : math.gcd(...this.sensors.map(s => s.config.measureInterval));

    this.logger.info(`Configured ${this.sensors.length} sensors; main loop interval is ${this.interval} seconds`);

    process.on("SIGINT", this.shutdown);
    process.on("SIGTERM", this.shutdown);

    this.timer = setInterval(this.measure, this.interval * 1000);

    await this.mainLoop;
  }

  shutdown = () => {
    this.logger.error("Shutting down...");
    if (this.timer)
      clearInterval(this.timer);
    this.device?.end();
    this.metrics.shutdown();
    setTimeout(() => this.resolveMainLoop(), 500);
  }

  measure = () => {
    const start = new Date().getTime();
    this.measureAsync().then(
      () => {
        const end = new Date().getTime();
        this.logger.verbose(`Measurements took ${end - start} ms`);
      },
      e => {
        this.logger.error("Measurements failed", e);
      }
    );
  }

  measureAsync = async () => {
    for (let i = 0; i < this.sensors.length; i++) {
      const item = this.sensors[i];
      this.logger.info(`Measuring sensor ${i} (${item.config.type}/${item.config.model})`);
      const result = await item.sensor.read();
      if (item.config.print)
        this.logger.debug(`Measurement complete for sensor ${i} (${item.config.type}/${item.config.model}): ${JSON.stringify(result)}`);
    }
  }

  private mainLoop = new Promise<void>((resolve) => {
    this.resolveMainLoop = resolve;
  });
  private metrics = new Metrics();
  private timer: NodeJS.Timeout | undefined;
  private resolveMainLoop: () => void = () => { 
    // this should never be called; it should always be overwritten with another function
    rootLogger.error("This is a bug");
  };
  private logger: rootLogger.Logger = rootLogger.child({ type: "main" });
  private device: HomieDevice | undefined = undefined;
  private interval = 0;
  private readonly sensors: Array<{ sensor: ISensor<Record<never, any>>, config: Sensor }> = []; // eslint-disable-line @typescript-eslint/no-explicit-any
}

new Main().run().then(null, e => {
  rootLogger.error(e);
});