declare module "pdf-img-convert" {
  const api: {
    convert: (
      filePath: string,
      options?: {
        width?: number;
        height?: number;
        page_numbers?: number[];
      },
    ) => Promise<Uint8Array[]>;
  };

  export = api;
}
