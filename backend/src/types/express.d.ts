export {};

declare module "express-serve-static-core" {
  interface Request {
    subscriber?: {
      id: number;
      planId: number;
      accountStatus: string;
    };
  }
}
