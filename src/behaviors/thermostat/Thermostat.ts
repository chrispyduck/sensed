import { HomieDevice, HomieProperty, PropertyDataType } from "@chrispyduck/homie-device";
import { ISensor, ITemperatureAndHumidity } from "@chrispyduck/homie-sensors";
import { promise as GPIO, DIR_OUT } from "rpi-gpio";
import { Sensors } from "../../Sensors";
import { Behavior } from "../Behavior";
import { IBehaviorConfig } from "../IBehaviorConfig";
import { IThermostatAction, IThermostatConfig } from "./IThermostatConfig";

enum Status {
  INIT,
  ON,
  OFF,
}

interface IState {
  status: Status,
  lastOn: number,
  lastOff: number,
}

export class Thermostat extends Behavior<IThermostatConfig> {
  constructor(config: IBehaviorConfig<IThermostatConfig>) {
    super(config);
    this.setPoint$ = config.config.defaultSetPoint;
  }

  private setPoint$: number;
  private lastObservedTemperature$ = 0;
  private temperatureSensor$?: ISensor<ITemperatureAndHumidity>;
  private state: {
    heat: IState,
    fan: IState
  } = {
    heat: this.newState(),
    fan: this.newState(),
  };
  private properties?: {
    setPoint: HomieProperty,
    heatOn: HomieProperty,
    fanOn: HomieProperty,
    safetyMin: HomieProperty,
    safetyMax: HomieProperty,
  }
  private timestamps: {
    lastTemperature: number,
    lastHeatOn: number,
    lastHeatOff: number,
    lastFanOn: number,
    lastFanOff: number,
  } = {
    lastTemperature: 0,
    lastHeatOn: 0,
    lastHeatOff: 0,
    lastFanOn: 0,
    lastFanOff: 0,
  }

  private newState(): IState {
    return {
      status: Status.INIT,
      lastOn: 0,
      lastOff: 0,
    };
  }

  public async init(sensors: Sensors, device: HomieDevice): Promise<void> {
    // wire up connection to sensor
    this.temperatureSensor$ = sensors[this.config.config.temperatureSensorId] as unknown as ISensor<ITemperatureAndHumidity>;
    if (!this.temperatureSensor$) {
      throw new Error(`Unable to locate temperature sensor with ID "${this.config.config.temperatureSensorId}"`);
    }
    this.temperatureSensor$.on("read", temp => {
      this.lastObservedTemperature$ = temp.temperature;
      this.timestamps.lastTemperature = Date.now();
      super.logger.debug(`Observed temperature: ${this.lastObservedTemperature$}`)
    })

    // create homie node properties
    const node = device.node({
      name: this.config.id,
      friendlyName: "Thermostat Behavior",
      type: "behavior",
      isRange: false
    });
    this.properties = {
      setPoint: node.addProperty({
        dataType: PropertyDataType.float,
        name: "temperature",
        friendlyName: "Temperature Set Point",
        settable: true,
        format: "-20:120",
        unit: "°F",
        retained: true,
      }),
      safetyMin: node.addProperty({
        dataType: PropertyDataType.float,
        name: "safety-min",
        friendlyName: "Safety Temperature Minimum Set Point",
        settable: false,
        format: "-20:120",
        unit: "°F",
        retained: true,
      }),
      safetyMax: node.addProperty({
        dataType: PropertyDataType.float,
        name: "safety-max",
        friendlyName: "Safety Temperature Maximum Set Point",
        settable: false,
        format: "-20:120",
        unit: "°F",
        retained: true,
      }),
      heatOn: node.addProperty({
        dataType: PropertyDataType.boolean,
        name: "heat-on",
        friendlyName: "Is Heat On",
        settable: false,
        retained: false,
      }),
      fanOn: node.addProperty({
        dataType: PropertyDataType.boolean,
        name: "fan-on",
        friendlyName: "Is Fan On",
        settable: false,
        retained: false,
      }),
    };
    this.properties.safetyMin.publishValue(this.config.config.safetyRange.low);
    this.properties.safetyMax.publishValue(this.config.config.safetyRange.high);

    // wire up setter for set point, and publish current value
    this.properties.setPoint.on("set", (_: { isRange: boolean, index?: number }, value: string | null) => {
      this.updateSetPoint(value);
    });
    this.properties.setPoint.publishValue(this.setPoint$);

    // configure gpio
    await GPIO.setup(this.config.config.actions.fanSwitch.pin, DIR_OUT);
    await GPIO.setup(this.config.config.actions.heatSwitch.pin, DIR_OUT);
  }

  private updateSetPoint(newValue: number | string | null | undefined) {
    if (!newValue) {
      super.logger.debug("updateSetPoint() called with no value; ignoring");
      return;
    }
    if (typeof newValue === "string")
      newValue = parseFloat(newValue);

    if (newValue > this.config.config.safetyRange.high) {
      super.logger.warn(`updateSetPoint() called with out of range value: ${newValue} is greater than configured limit of ${this.config.config.safetyRange.high}`);
      newValue = this.config.config.safetyRange.high;
    }
    else if (newValue < this.config.config.safetyRange.low) {
      super.logger.warn(`updateSetPoint() called with out of range value: ${newValue} is less than configured limit of ${this.config.config.safetyRange.low}`);
      newValue = this.config.config.safetyRange.low;
    }

    super.logger.info(`Changed set point to ${newValue}`);
    this.setPoint$ = newValue;
  }

  public async run(): Promise<void> {
    if (!this.temperatureSensor$)
      throw new Error("Not initialized");

    // require a reading at least every minute
    if (Date.now() - this.timestamps.lastTemperature > 60000) {
      super.logger.warn("No temperature reading in the last 60s; forcing a new reading");
      await this.temperatureSensor$.read();
    }

    // quick comparison to determine whether the heater should be on
    if (this.lastObservedTemperature$ > this.setPoint$ + 0.5) {
      // heat should be off
      if (this.state.heat.status != Status.OFF) {
        this.heatOff();
      }
    } else if (this.lastObservedTemperature$ < this.setPoint$ - 0.5) {
      // should be on
      if (this.state.heat.status != Status.ON) {
        await this.heatOn();
      }
    }

    // fan setting follows the heater
    let fanDesiredState: Status;
    if (this.state.heat.status == Status.ON) {
      // fan must be on if heat is on
      fanDesiredState = Status.ON;
    } else {
      // heat is off; if it's recently off, leave the fan on (5 minutes)
      fanDesiredState = (Date.now() - this.timestamps.lastHeatOff < 300000)
        ? Status.ON
        : Status.OFF;
    }
    if (this.state.fan.status != fanDesiredState) {
      if (fanDesiredState == Status.ON)
        this.fanOn();
      else
        this.fanOff();
    }
  }

  private async fanOn(): Promise<void> {
    this.logger.info("Activating fan");
    await this.executeAction(this.config.config.actions.fanSwitch, true);
    this.properties?.fanOn.publishValue(true);
    this.state.heat.status = Status.ON;
    this.timestamps.lastFanOn = Date.now();
  }
  private async fanOff(): Promise<void> {
    this.logger.info("Deactivating heat");
    await this.executeAction(this.config.config.actions.fanSwitch, true);
    this.properties?.fanOn.publishValue(false);
    this.state.heat.status = Status.OFF;
    this.timestamps.lastFanOff = Date.now();
  }
  private async heatOn(): Promise<void> {
    this.logger.info("Activating heat");
    await this.executeAction(this.config.config.actions.heatSwitch, true);
    this.properties?.heatOn.publishValue(true);
    this.state.heat.status = Status.ON;
    this.timestamps.lastHeatOn = Date.now();
  }
  private async heatOff(): Promise<void> {
    this.logger.info("Deactivating heat");
    await this.executeAction(this.config.config.actions.heatSwitch, false);
    this.properties?.heatOn.publishValue(false);
    this.state.heat.status = Status.OFF;
    this.timestamps.lastHeatOff = Date.now();
  }

  private async executeAction(action: IThermostatAction, on: boolean): Promise<void> {
    if (action.type != "gpio")
      throw new Error(`Unsupported action, "${action.type}"`);
    await GPIO.write(action.pin, on);
  }

  public shutdown(): Promise<void> {
    throw new Error("Method not implemented.");
  }
}