export type DependencyToken<T> = string & { readonly __type?: T };

export type Factory<T> = () => T;

export interface RegistrationOptions {
  readonly singleton?: boolean;
}

export const createToken = <T>(id: string): DependencyToken<T> => id as DependencyToken<T>;

export class Container {
  private readonly factories = new Map<DependencyToken<unknown>, Factory<unknown>>();
  private readonly singletons = new Map<DependencyToken<unknown>, unknown>();
  private readonly singletonFlags = new Map<DependencyToken<unknown>, boolean>();

  register<T>(token: DependencyToken<T>, factory: Factory<T>, options: RegistrationOptions = {}): void {
    this.factories.set(token, factory);
    if (!options.singleton) {
      this.singletonFlags.delete(token);
      this.singletons.delete(token);
    } else {
      this.singletonFlags.set(token, true);
      this.singletons.delete(token);
    }
  }

  resolve<T>(token: DependencyToken<T>): T {
    if (this.singletonFlags.get(token)) {
      if (this.singletons.has(token)) {
        return this.singletons.get(token) as T;
      }

      const instance = this.instantiate(token);
      this.singletons.set(token, instance);
      return instance;
    }

    return this.instantiate(token);
  }

  has(token: DependencyToken<unknown>): boolean {
    return this.factories.has(token);
  }

  private instantiate<T>(token: DependencyToken<T>): T {
    const factory = this.factories.get(token);
    if (!factory) {
      throw new Error(`Dependency for token "${token.toString()}" is not registered.`);
    }

    return factory() as T;
  }
}
