// The libraries a Canvas2D layer's code imports, each defined as a CommonJS-style factory and run
// on first use. The worker gets makeModules as source text, so it must not use anything from
// outside its own body.

type ModuleFactory = (module: {exports: unknown}, exports: unknown) => void;

export function makeModules() {
  const factories: Record<string, ModuleFactory> = {};
  const modules: Record<string, unknown> = {};
  return {
    define(name: string, factory: ModuleFactory) {
      factories[name] = factory;
    },
    // A library's exports; with `byDefault`, what `import name from` gives.
    lib(name: string, byDefault = false): unknown {
      if (!(name in modules)) {
        const module = {exports: {} as unknown};
        factories[name]!(module, module.exports);
        modules[name] = module.exports;
      }
      const exported = modules[name] as {__esModule?: boolean; default?: unknown} | undefined;
      return byDefault && exported?.__esModule && "default" in exported ? exported.default : exported;
    },
  };
}
