export interface IThermostatConfig {
  /**
   * ID of the temperature sensor
   */
  temperatureSensorId: string;

  /**
   * 
   */
  safetyRange: {
    /**
     * The temperature set point should never be below this value
     */
    low: number;

    /**
     * The temperature set point should never be above this value
     */
    high: number;
  };

  /**
   * The default set point for this thermostat, to be used when no value
   * has been set remotely
   */
  defaultSetPoint: number;

  /**
   * Configures how this thermostat will control it's environment
   */
  actions: {
    /**
     * The action to perform to enable air circulation
     */
    fanSwitch: IThermostatAction,

    /**
     * The action to perform to enable heating
     */
    heatSwitch: IThermostatAction,
  }
}

export interface IThermostatAction {
  type: "gpio",
  pin: number,
}

export const DefaultConfiguration: IThermostatConfig = {
  temperatureSensorId: "0",
  safetyRange: {
    low: 40,
    high: 80
  },
  defaultSetPoint: 71,
  actions: {
    fanSwitch: {
      type: "gpio",
      pin: 14,
    },
    heatSwitch: {
      type: "gpio",
      pin: 14
    },
  },
};
