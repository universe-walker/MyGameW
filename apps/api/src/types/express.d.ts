import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: number; username?: string | null; first_name?: string | null };
  }
}

