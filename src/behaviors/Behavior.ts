import { HomieDevice } from "@chrispyduck/homie-device";
import winston from "../Logging";
import { Sensors } from "../Sensors";
import { IBehaviorConfig } from "./IBehaviorConfig";

export abstract class Behavior<TConfig> {

  constructor(config: IBehaviorConfig<TConfig>) {
    this.config$ = config;
    this.logger = winston.child({
      type: "behavior",
      name: config.id,
    });
  }

  private config$: IBehaviorConfig<TConfig>;
  protected readonly logger: winston.Logger;

  public get config(): IBehaviorConfig<TConfig> {
    return this.config$;
  }

  /**
   * Prepares the behavior for use
   */
  public abstract init(sensors: Sensors, device: HomieDevice): Promise<void>;

  /**
   * Executes the behavior
   */
  public abstract run(): Promise<void>;

  /**
   * Shuts down the behavior
   */
  public abstract shutdown(): Promise<void>;
}