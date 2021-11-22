import { HomieDevice } from "@chrispyduck/homie-device";
import { AHT20, ISensor } from "@chrispyduck/homie-sensors";
import IConfiguration, { II2CSensor, Sensor } from "./IConfiguration";
import fs from "fs";
import * as math from "mathjs";
import rootLogger, { setLevel } from "./Logging";
import process from "process";
import Metrics from "./Metrics";
import { Sensors } from "./Sensors";
import { Behavior, IBehaviorConfig } from "./behaviors";
import { Thermostat } from "./behaviors/thermostat/Thermostat";
import { IThermostatConfig } from "./behaviors/thermostat/IThermostatConfig";

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

  resolveBehavior = (config: IBehaviorConfig<Record<never, {}>>) => {
    switch (config.type) {
      case "thermostat": {
        return new Thermostat(<IBehaviorConfig<IThermostatConfig>>config);
      }
    }
    throw new Error(`Unsupported behavior type: ${config.type}`)
  }

  run = async () => {
    const config = await this.loadConfig();
    setLevel(config.logLevel || "info");

    const device = this.device = new HomieDevice(config.device);
    const initJobs = config.sensors
      .map(sensorConfig => ({
        sensor: this.resolveSensor(sensorConfig),
        config: sensorConfig
      }))
      .map((sensorAndConfig, idx) => {
        if (!sensorAndConfig.config.id) {
          // make sure an ID is always set
          sensorAndConfig.config.id = `${idx}.${sensorAndConfig.config.type}.${sensorAndConfig.config.model}`;
        }
        sensorAndConfig.sensor.register(device);
        this.sensors[sensorAndConfig.config.id] = sensorAndConfig;
        return sensorAndConfig.sensor.init();
      });

    config.behaviors.forEach((behaviorConfig, idx) => {
      if (!behaviorConfig.id)
        behaviorConfig.id = `${idx}.${behaviorConfig.type}`;
      const behavior = this.resolveBehavior(behaviorConfig);
      this.behaviors.push(behavior);
      initJobs.push(behavior.init(this.sensors, device));
    })

    await Promise.all(initJobs);

    device.setup();
    this.metrics.init(config);

    const allSensors = Object.values(this.sensors);
    this.sensorInterval = allSensors.length == 1
      ? this.sensors[0].config.measureInterval
      : math.gcd(...allSensors.map(s => s.config.measureInterval));
    this.logger.info(`Configured ${allSensors.length} sensors; main loop interval is ${this.sensorInterval} seconds`);
    this.sensorTimer = setInterval(this.measure, this.sensorInterval * 1000);

    if (this.behaviors.length > 0) {
      this.behaviorInterval = this.behaviors.length == 1
        ? this.behaviors[0].config.runInterval
        : math.gcd(...this.behaviors.map(b => b.config.runInterval));
      this.logger.info(`Configured ${this.behaviors.length} behaviors; main loop interval is ${this.behaviorInterval} seconds`);
      this.behaviorTimer = setInterval(this.runBehaviors, this.behaviorInterval * 1000);
    }

    process.on("SIGINT", this.shutdown);
    process.on("SIGTERM", this.shutdown);

    await this.mainLoop;
  }

  shutdown = () => {
    this.logger.error("Shutting down...");
    if (this.sensorTimer)
      clearInterval(this.sensorTimer);
    if (this.behaviorTimer)
      clearInterval(this.behaviorTimer);
    this.behaviors.forEach(behavior => behavior.shutdown());
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
    const allSensors = Object.values(this.sensors);
    for (let i = 0; i < allSensors.length; i++) {
      const item = allSensors[i];
      this.logger.info(`Measuring sensor ${i} (${item.config.type}/${item.config.model})`);
      const result = await item.sensor.read();
      if (item.config.print)
        this.logger.debug(`Measurement complete for sensor ${item.config.id} at index ${i} (${item.config.type}/${item.config.model}): ${JSON.stringify(result)}`);
    }
  }

  runBehaviors = () => {
    const start = new Date().getTime();
    this.measureAsync().then(
      () => {
        const end = new Date().getTime();
        this.logger.verbose(`Behaviors took ${end - start} ms`);
      },
      e => {
        this.logger.error("Behaviors failed", e);
      }
    );
  }

  runBehaviorsAsync = async () => {
    return Promise.all(this.behaviors.map(behavior => {
      this.logger.info(`Running behavior ${behavior.config.id} (${behavior.config.type})`);
      return behavior.run();
    }));
  }

  private resolveMainLoop: () => void = () => { 
    // this should never be called; it should always be overwritten with another function
    rootLogger.error("This is a bug");
  };
  private mainLoop = new Promise<void>((resolve) => {
    // all logic is handled in timers, so we're just here to keep the program from exiting
    this.resolveMainLoop = resolve;
  });

  private metrics = new Metrics();
  private sensorTimer: NodeJS.Timeout | undefined;
  private behaviorTimer: NodeJS.Timeout | undefined;

  private logger: rootLogger.Logger = rootLogger.child({ type: "main" });
  private device: HomieDevice | undefined = undefined;
  private sensorInterval = 0;
  private behaviorInterval = 0;

  private readonly sensors: Sensors = {};
  private readonly behaviors: Array<Behavior<Record<never, {}>>> = [];
}

new Main().run().then(null, e => {
  rootLogger.error(e);
});