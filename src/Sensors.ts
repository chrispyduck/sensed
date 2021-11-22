import { ISensor } from "@chrispyduck/homie-sensors";
import { Sensor } from "./IConfiguration";

export type Sensors = Record<
  string,
  {
    sensor: ISensor<Record<never, any>>,
    config: Sensor
  }
>;