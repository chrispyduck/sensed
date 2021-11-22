import { IHomieDeviceConfiguration } from "@chrispyduck/homie-device";
import { II2CConfiguration } from "@chrispyduck/homie-sensors";
import { IBehaviorConfig } from "./behaviors";

/**
 * The configuration file format
 */
export default interface IConfiguration {
  /**
   * Configuration of the homie device 
   */
  device: IHomieDeviceConfiguration;

  /**
   * All sensors that should be configured
   */
  sensors: Array<Sensor>;

  /** All behaviors that should be configured */
  behaviors: Array<IBehaviorConfig<Record<never, {}>>>;

  logLevel: string;

  /**
   * The port number that this service will listen on for HTTP requests for the /metrics and /health endpoints
   */
  port?: number;
}

export type Sensor = II2CSensor;

/**
 * Sensor configuration
 * @tempate TConfig - The configuration object format
 */
export interface ISensor<TConfig extends Record<never, any>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  
  /**
   * Unique identifier for this sensor, used to reference it elsewhere
   */
  id: string;

  /**
   * The type of sensor
   */
  type: string;

  /**
   * The interval between measurements, in seconds
   */
  measureInterval: number;

  /**
   * The sensor's configuration
   */
  configuration: TConfig;

  /**
   * Whether to print measurement results in the log when they are taken
   */
  print: boolean;
}

/**
 * Configuration of an I2C sensor
 */
export interface II2CSensor extends ISensor<II2CConfiguration> {
  type: "i2c";

  /**
   * The model of sensor; used to find the appropriate implementation class
   */
  model: string;
}
