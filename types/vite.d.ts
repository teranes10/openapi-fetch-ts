type Input = { src: string; output: string };
type Options = { src: Input[] };

declare function OpenApiFetch({ src }: Options): {
  name: string;
  buildStart(): Promise<void>;
};

export { OpenApiFetch as default };
