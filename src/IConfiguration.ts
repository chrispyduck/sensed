import { IHomieDeviceConfiguration } from "@chrispyduck/homie-device";
import { II2CConfiguration } from "@chrispyduck/homie-sensors";

export default interface IConfiguration {
  /**
   * Configuration of the homie device 
   */
  device: IHomieDeviceConfiguration;

  /**
   * All sensors that should be 
   */
  sensors: Array<Sensor>;
}

export type Sensor = II2CSensor;

export interface ISensor<TConfig extends Record<never, any>> {
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
   * Whether to print measurement results in the log
   */
  print: boolean;
}

export interface II2CSensor extends ISensor<II2CConfiguration> {
  type: "i2c";

  /**
   * The model of sensor; used to find the appropriate implementation class
   */
  model: string;
}
