export interface IBehaviorConfig<TConfig> {
  id: string;
  
  type: string;

  /**
   * The behavior will be executed every `runInterval` seconds.
   */
  runInterval: number;

  config: TConfig;
}