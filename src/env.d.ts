interface ImportMeta {
    glob<M>(pattern: string, options: { eager: true }): Record<string, M>;
}
