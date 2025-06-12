// Feature and FeatureGroup types copied from framework/features.ts

export type Feature<X extends Extra = any> = {
  cmd: string[];
  description: string | null;
  longDescription?: string;
  arguments: (PositionalArgument<X> | OptionArgument<X>)[];
  invoke: (ctx: FeatureContextWithFeature<X>) => Promise<void | FeatureResult<X> | undefined>;
} & Partial<X extends { Feature: object } ? X["Feature"] : {}>;

export type FeatureGroup<X extends Extra = any> = {
  title?: string;
  name?: string;
  description?: string;
  longDescription?: string;
  visibility?: "show" | "collapse" | "hide";
  features: (Feature<X> | FeatureGroup<X>)[];
};

export type Extra = {
  FeatureContext: object;
  Feature: object;
};

export type FeatureContext<X extends Extra> = {
  app: any;
  cmd?: string;
  feature?: Feature<X>;
  argv: string[];
  verbose: boolean;
  quiet: boolean;
  formatJson: boolean;
  isInteractiveMode: boolean;
  x: X["FeatureContext"];
};

export type FeatureContextWithFeature<X extends Extra> = Omit<FeatureContext<X>, "feature"> & Required<Pick<FeatureContext<X>, "feature">>;

export type FeatureResult<X extends Extra> = {
  exit?: boolean;
  ctx?: Partial<FeatureContext<X>>;
};

export type PositionalArgument<X extends Extra> = Argument<X> & {
  kind: "positional" | "catch-all";
};

export type OptionArgument<X extends Extra> = Argument<X> & {
  kind: "option";
  alias?: string;
  valueName?: string;
  isFlag?: boolean;
  isRequired?: boolean;
};

type Argument<X extends Extra> = {
  name: string;
  description: string;
  autocomplete?: (ctx: FeatureContext<X>, input: string) => Promise<string[]>;
};